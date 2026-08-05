const Player = require('../models/Player');
const Payment = require('../models/Payment');
const Parent = require('../models/Parent');
const TrainingGroup = require('../models/TrainingGroup');
const HistoryEntry = require('../models/HistoryEntry');
const { validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt } = require('../utils/encryption');
const { clearDashboardReportCache } = require('./reportController');
const {
  restoreStateAt,
  getHistoryAvailableSince,
  snapshotPlayerDocument,
  snapshotPaymentDocument,
  createHistoryEntry
} = require('../utils/history');

const snapshotRestoreJobs = new Map();

const asObjectId = (value) => (validateObjectId(value) ? value : undefined);
const asDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const buildPlayerRestorePayload = (snapshot) => ({
  fullName: snapshot.fullName || '',
  dateOfBirth: asDate(snapshot.dateOfBirth) || null,
  parentId: asObjectId(snapshot.parentId),
  parentPhoneEncrypted: snapshot.parentPhone ? encrypt(snapshot.parentPhone) : ' ',
  programId: asObjectId(snapshot.programId) || null,
  groupId: asObjectId(snapshot.groupId || snapshot.groupIds?.[0]?._id) || null,
  groupIds: Array.isArray(snapshot.groupIds)
    ? snapshot.groupIds.map((group) => asObjectId(group._id)).filter(Boolean)
    : [asObjectId(snapshot.groupId)].filter(Boolean),
  coachId: asObjectId(snapshot.coachId) || null,
  subscriptionId: asObjectId(snapshot.subscriptionId) || null,
  level: snapshot.level || '',
  startDate: asDate(snapshot.startDate) || null,
  endDate: asDate(snapshot.endDate) || null,
  currentSubscriptionStartedAt: asDate(snapshot.currentSubscriptionStartedAt) || null,
  packageName: snapshot.packageName || '',
  packageClasses: Number(snapshot.packageClasses || 0),
  packageHours: Number(snapshot.packageHours || 0),
  payment: Number(snapshot.payment || 0),
  note: snapshot.note || '',
  freezeNote: snapshot.freezeNote || '',
  status: snapshot.status || 'active',
  showInAttendanceWhenFrozen: snapshot.showInAttendanceWhenFrozen !== false,
  subscriptionNeedsAttention: Boolean(snapshot.subscriptionNeedsAttention),
  attendanceAlertEnabled: Boolean(snapshot.attendanceAlertEnabled),
  isDeleted: false,
  deletedAt: null,
  profileImage: snapshot.profileImage || '',
  createdAt: asDate(snapshot.createdAt) || new Date()
});

const buildPaymentRestorePayload = (snapshot) => ({
  playerId: asObjectId(snapshot.playerId),
  playerNameSnapshot: snapshot.playerName || '',
  parentNameSnapshot: snapshot.parentName || '',
  parentPhoneSnapshot: snapshot.parentPhoneSnapshot || '',
  packageNameSnapshot: snapshot.packageName || '',
  packageClassesSnapshot: Number(snapshot.packageClasses || 0),
  packageHoursSnapshot: Number(snapshot.packageHours || 0),
  subscriptionId: asObjectId(snapshot.subscriptionId) || null,
  totalAmount: Number(snapshot.totalAmount || 0),
  paidAmount: Number(snapshot.paidAmount || 0),
  remainingAmount: Number(snapshot.remainingAmount || 0),
  transactionType: snapshot.transactionType || '',
  paymentMethod: ['Click', 'Cash', 'Bank Transfer'].includes(snapshot.paymentMethod) ? snapshot.paymentMethod : 'Cash',
  receiptImage: snapshot.receiptImage || '',
  paymentDate: asDate(snapshot.paymentDate) || new Date(),
  notesEncrypted: encrypt(snapshot.notes || ''),
  createdBy: asObjectId(snapshot.createdBy) || null,
  createdAt: asDate(snapshot.createdAt) || asDate(snapshot.paymentDate) || new Date(),
  updatedBy: asObjectId(snapshot.updatedBy) || null,
  updatedAt: asDate(snapshot.updatedAt) || null
});

const loadPlayerForSnapshot = (id) => Player.findById(id)
  .populate('parentId', 'name')
  .populate('programId', 'name level')
  .populate('groupId', 'name')
  .populate('groupIds', 'name')
  .populate('coachId', 'name')
  .populate('subscriptionId', 'type status totalSessions remainingSessions usedSessions startDate endDate price');

const loadPaymentForSnapshot = (id) => Payment.findById(id)
  .populate({
    path: 'playerId',
    select: 'fullName parentId',
    populate: { path: 'parentId', select: 'name' }
  })
  .populate('createdBy', 'name')
  .populate('updatedBy', 'name');

const syncParentChildren = async () => {
  const activePlayers = await Player.find({ isDeleted: { $ne: true } }).select('_id parentId').lean();
  const childrenByParentId = new Map();

  activePlayers.forEach((player) => {
    const parentId = String(player.parentId || '');
    if (!parentId) return;
    if (!childrenByParentId.has(parentId)) {
      childrenByParentId.set(parentId, []);
    }
    childrenByParentId.get(parentId).push(player._id);
  });

  const parents = await Parent.find().select('_id children');
  for (const parent of parents) {
    parent.children = childrenByParentId.get(String(parent._id)) || [];
    await parent.save();
  }
};

const syncGroupCounts = async () => {
  const counts = await Player.aggregate([
    { $match: { isDeleted: { $ne: true }, status: { $ne: 'left' } } },
    {
      $project: {
        groupIds: {
          $setUnion: [
            { $ifNull: ['$groupIds', []] },
            {
              $cond: [
                { $ne: [{ $ifNull: ['$groupId', null] }, null] },
                ['$groupId'],
                []
              ]
            }
          ]
        }
      }
    },
    { $unwind: '$groupIds' },
    { $group: { _id: '$groupIds', currentCount: { $sum: 1 } } }
  ]);
  const countByGroupId = new Map(counts.map((item) => [String(item._id), item.currentCount]));
  const groups = await TrainingGroup.find().select('_id currentCount');

  for (const group of groups) {
    group.currentCount = countByGroupId.get(String(group._id)) || 0;
    await group.save();
  }
};

const restorePlayers = async (targetPlayers, req) => {
  const targetById = new Map(targetPlayers.map((player) => [String(player._id), player]));
  const currentPlayers = await Player.find({}).select('_id parentId isDeleted').lean();
  const operations = [];
  let restored = 0;
  let removed = 0;
  let skipped = 0;

  for (const player of currentPlayers) {
    const playerId = String(player._id);
    const target = targetById.get(playerId);

    if (!target) {
      if (!player.isDeleted) {
        operations.push({
          updateOne: {
            filter: { _id: player._id },
            update: {
              $set: {
                isDeleted: true,
                deletedAt: new Date()
              }
            }
          }
        });
        removed += 1;
      }
      continue;
    }

    const payload = buildPlayerRestorePayload(target);
    if (!payload.parentId && player.parentId) {
      payload.parentId = player.parentId;
    }
    if (!payload.parentId) {
      skipped += 1;
      targetById.delete(playerId);
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: player._id },
        update: { $set: payload }
      }
    });
    restored += 1;
    targetById.delete(playerId);
  }

  for (const target of targetById.values()) {
    const payload = buildPlayerRestorePayload(target);
    if (!payload.parentId || !validateObjectId(target._id)) {
      skipped += 1;
      continue;
    }
    operations.push({
      insertOne: {
        document: { _id: target._id, ...payload }
      }
    });
    restored += 1;
  }

  if (operations.length) {
    await Player.bulkWrite(operations, { ordered: false });
  }

  return { restored, removed, skipped };
};

const restorePayments = async (targetPayments, req) => {
  const targetById = new Map(targetPayments.map((payment) => [String(payment._id), payment]));
  const currentPayments = await Payment.find({}).select('_id playerId').lean();
  const operations = [];
  let restored = 0;
  let removed = 0;
  let skipped = 0;

  for (const payment of currentPayments) {
    const paymentId = String(payment._id);
    const target = targetById.get(paymentId);

    if (!target) {
      operations.push({
        deleteOne: {
          filter: { _id: payment._id }
        }
      });
      removed += 1;
      continue;
    }

    const payload = buildPaymentRestorePayload(target);
    if (!payload.playerId && payment.playerId) {
      payload.playerId = payment.playerId;
    }
    if (!payload.playerId) {
      skipped += 1;
      targetById.delete(paymentId);
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: payment._id },
        update: { $set: payload }
      }
    });
    restored += 1;
    targetById.delete(paymentId);
  }

  for (const target of targetById.values()) {
    const payload = buildPaymentRestorePayload(target);
    if (!payload.playerId || !validateObjectId(target._id)) {
      skipped += 1;
      continue;
    }
    operations.push({
      insertOne: {
        document: { _id: target._id, ...payload }
      }
    });
    restored += 1;
  }

  if (operations.length) {
    await Payment.bulkWrite(operations, { ordered: false });
  }

  return { restored, removed, skipped };
};

const getHistorySnapshot = async (req, res, next) => {
  try {
    const { entityType, at } = req.query;

    if (!['player', 'payment', 'attendance'].includes(entityType)) {
      return res.status(400).json({ message: 'History requires entityType=player, entityType=payment, or entityType=attendance.' });
    }

    if (!at) {
      return res.status(400).json({ message: 'History requires a target date and time.' });
    }

    const asOf = new Date(at);
    if (Number.isNaN(asOf.getTime())) {
      return res.status(400).json({ message: 'Invalid history date/time.' });
    }

    const rows = await restoreStateAt(entityType, asOf);
    const availableSince = await getHistoryAvailableSince(entityType);
    res.json({
      entityType,
      asOf: asOf.toISOString(),
      availableSince: availableSince ? new Date(availableSince).toISOString() : null,
      count: rows.length,
      rows
    });
  } catch (error) {
    console.error('Snapshot restore error:', error);
    next(error);
  }
};

const getPlayerHistory = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    if (!validateObjectId(playerId)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }

    const entries = await HistoryEntry.find({
      entityType: 'player',
      entityId: playerId
    })
      .sort({ changedAt: 1, _id: 1 })
      .select('action before after changedFields changedAt')
      .lean();

    res.json({
      playerId,
      entries: entries.map((entry) => ({
        action: entry.action,
        changedAt: entry.changedAt,
        changedFields: entry.changedFields || [],
        before: entry.before || null,
        after: entry.after || null
      }))
    });
  } catch (error) {
    next(error);
  }
};

const runSnapshotRestore = async ({ jobId, asOf, reqMeta }) => {
  const job = snapshotRestoreJobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'running';
    job.message = 'Preparing snapshot...';
    const [players, payments] = await Promise.all([
      restoreStateAt('player', asOf),
      restoreStateAt('payment', asOf)
    ]);

    job.message = 'Restoring players...';
    const playerResult = await restorePlayers(players, reqMeta);
    job.message = 'Restoring payments...';
    const paymentResult = await restorePayments(payments, reqMeta);
    job.message = 'Rebuilding links and counters...';
    await Promise.all([
      syncParentChildren(),
      syncGroupCounts()
    ]);
    clearDashboardReportCache();
    await createAuditLog({ userId: reqMeta.user._id, action: `restore snapshot ${asOf.toISOString()}`, entity: 'HistoryEntry', entityId: null, req: reqMeta });

    job.status = 'complete';
    job.message = 'Snapshot restored successfully.';
    job.result = {
      asOf: asOf.toISOString(),
      players: playerResult,
      payments: paymentResult
    };
    job.completedAt = new Date();
  } catch (error) {
    console.error('Snapshot restore error:', error);
    job.status = 'failed';
    job.message = error.message || 'Unable to restore snapshot.';
    job.completedAt = new Date();
  }
};

const restoreHistorySnapshot = async (req, res, next) => {
  try {
    const { at, confirm } = req.body || {};
    if (confirm !== 'RESTORE') {
      return res.status(400).json({ message: 'Snapshot restore requires confirmation.' });
    }

    if (!at) {
      return res.status(400).json({ message: 'Snapshot restore requires a target date and time.' });
    }

    const asOf = new Date(at);
    if (Number.isNaN(asOf.getTime())) {
      return res.status(400).json({ message: 'Invalid snapshot date/time.' });
    }

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    snapshotRestoreJobs.set(jobId, {
      id: jobId,
      status: 'queued',
      message: 'Snapshot restore queued.',
      asOf: asOf.toISOString(),
      startedAt: new Date(),
      result: null
    });

    const reqMeta = {
      user: req.user,
      ip: req.ip,
      headers: req.headers
    };
    setImmediate(() => runSnapshotRestore({ jobId, asOf, reqMeta }));

    res.status(202).json({
      jobId,
      status: 'queued',
      message: 'Snapshot restore started.',
      asOf: asOf.toISOString()
    });
  } catch (error) {
    next(error);
  }
};

const getSnapshotRestoreStatus = (req, res) => {
  const job = snapshotRestoreJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ message: 'Snapshot restore job was not found.' });
  }

  res.json(job);
};

module.exports = { getHistorySnapshot, getPlayerHistory, restoreHistorySnapshot, getSnapshotRestoreStatus };
