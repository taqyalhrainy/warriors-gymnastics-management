const Player = require('../models/Player');
const Payment = require('../models/Payment');
const Attendance = require('../models/Attendance');
const HistoryEntry = require('../models/HistoryEntry');
const { decrypt } = require('./encryption');

const safeDecrypt = (value) => {
  if (!value) return '';
  try {
    return decrypt(value);
  } catch (error) {
    return '';
  }
};

const normalizeId = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value._id) return String(value._id);
  return String(value);
};

const buildGroupSnapshots = (player) => {
  const groups = Array.isArray(player.groupIds) && player.groupIds.length
    ? player.groupIds
    : [player.groupId].filter(Boolean);

  return groups.map((group) => ({
    _id: normalizeId(group),
    name: group?.name || ''
  })).filter((group) => group._id || group.name);
};

const snapshotPlayerDocument = (playerDocument) => {
  const player = playerDocument?.toObject ? playerDocument.toObject({ virtuals: true }) : playerDocument;
  const groups = buildGroupSnapshots(player || {});

  return {
    _id: normalizeId(player?._id),
    fullName: player?.fullName || '',
    dateOfBirth: player?.dateOfBirth || null,
    parentId: normalizeId(player?.parentId),
    parentName: player?.parentId?.name || '',
    parentPhone: safeDecrypt(player?.parentPhoneEncrypted),
    programId: normalizeId(player?.programId),
    programName: player?.programId?.name || '',
    coachId: normalizeId(player?.coachId),
    coachName: player?.coachId?.name || '',
    subscriptionId: normalizeId(player?.subscriptionId),
    groupId: normalizeId(player?.groupId),
    groupName: player?.groupId?.name || groups[0]?.name || '',
    groupIds: groups,
    groupNames: groups.map((group) => group.name).filter(Boolean),
    level: player?.level || '',
    startDate: player?.startDate || null,
    endDate: player?.endDate || null,
    currentSubscriptionStartedAt: player?.currentSubscriptionStartedAt || null,
    currentSubscriptionAttendanceIds: (player?.currentSubscriptionAttendanceIds || []).map(normalizeId),
    packageName: player?.packageName || '',
    packageClasses: Number(player?.packageClasses || 0),
    packageHours: Number(player?.packageHours || 0),
    payment: Number(player?.payment || 0),
    dueAdjustment: Number(player?.dueAdjustment || 0),
    note: player?.note || '',
    freezeNote: player?.freezeNote || '',
    status: player?.status || '',
    showInAttendanceWhenFrozen: player?.showInAttendanceWhenFrozen !== false,
    subscriptionNeedsAttention: Boolean(player?.subscriptionNeedsAttention),
    attendanceAlertEnabled: Boolean(player?.attendanceAlertEnabled),
    profileImage: player?.profileImage || '',
    isDeleted: Boolean(player?.isDeleted),
    deletedAt: player?.deletedAt || null,
    createdAt: player?.createdAt || null
  };
};

const snapshotPaymentDocument = (paymentDocument) => {
  const payment = paymentDocument?.toObject ? paymentDocument.toObject() : paymentDocument;

  return {
    _id: normalizeId(payment?._id),
    playerId: normalizeId(payment?.playerId),
    playerName: payment?.playerNameSnapshot || payment?.playerId?.fullName || '',
    parentName: payment?.parentNameSnapshot || payment?.playerId?.parentId?.name || '',
    packageName: payment?.packageNameSnapshot || '',
    packageClasses: Number(payment?.packageClassesSnapshot || 0),
    packageHours: Number(payment?.packageHoursSnapshot || 0),
    subscriptionId: normalizeId(payment?.subscriptionId),
    totalAmount: Number(payment?.totalAmount || 0),
    paidAmount: Number(payment?.paidAmount || 0),
    remainingAmount: Number(payment?.remainingAmount || 0),
    transactionType: payment?.transactionType || '',
    paymentMethod: payment?.paymentMethod || '',
    parentPhoneSnapshot: payment?.parentPhoneSnapshot || '',
    receiptImage: payment?.receiptImage || '',
    paymentDate: payment?.paymentDate || null,
    notes: safeDecrypt(payment?.notesEncrypted),
    createdBy: normalizeId(payment?.createdBy),
    createdByName: payment?.createdBy?.name || '',
    createdAt: payment?.createdAt || null,
    updatedBy: normalizeId(payment?.updatedBy),
    updatedByName: payment?.updatedBy?.name || '',
    updatedAt: payment?.updatedAt || null
  };
};

const diffChangedFields = (before = {}, after = {}) => {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
};

const createBaselineEntries = async (entityType, snapshots) => {
  if (!snapshots.length) {
    return null;
  }

  const changedAt = new Date();
  await HistoryEntry.insertMany(
    snapshots.map((snapshot) => ({
      entityType,
      entityId: snapshot._id,
      action: 'create',
      before: null,
      after: snapshot,
      changedFields: Object.keys(snapshot),
      changedAt
    }))
  );

  return changedAt;
};

const createHistoryEntry = async ({ entityType, entityId, action, before = null, after = null, userId, req }) => {
  try {
    await HistoryEntry.create({
      entityType,
      entityId,
      action,
      before,
      after,
      changedFields: diffChangedFields(before || {}, after || {}),
      changedBy: userId,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '',
      userAgent: req?.headers?.['user-agent'] || ''
    });
  } catch (error) {
    console.error('History entry error:', error.message);
  }
};

const loadCurrentPlayerSnapshots = async () => {
  const players = await Player.find({})
    .sort({ createdAt: -1, _id: -1 })
    .populate('parentId', 'name')
    .populate('programId', 'name level')
    .populate('groupId', 'name')
    .populate('groupIds', 'name')
    .populate('coachId', 'name');

  return players.map(snapshotPlayerDocument);
};

const loadCurrentPaymentSnapshots = async () => {
  const payments = await Payment.find({})
    .sort({ paymentDate: -1, _id: -1 })
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  return payments.map(snapshotPaymentDocument);
};

const ensureHistoryBaseline = async (entityType) => {
  const existingEntry = await HistoryEntry.findOne({ entityType }).sort({ changedAt: 1 }).lean();
  if (existingEntry) {
    return existingEntry.changedAt;
  }

  const snapshots = entityType === 'player'
    ? await loadCurrentPlayerSnapshots()
    : await loadCurrentPaymentSnapshots();

  return createBaselineEntries(entityType, snapshots);
};

const ensureHistoryBaselines = async () => {
  await ensureHistoryBaseline('player');
  await ensureHistoryBaseline('payment');
};

const getHistoryAvailableSince = async (entityType) => {
  const entry = await HistoryEntry.findOne({ entityType }).sort({ changedAt: 1 }).lean();
  return entry?.changedAt || null;
};

const loadAttendanceForDate = async (asOf) => {
  const dayKey = new Date(asOf).toISOString().split('T')[0];
  const startOfDay = new Date(`${dayKey}T00:00:00.000Z`);
  const endOfDay = new Date(`${dayKey}T23:59:59.999Z`);

  const attendance = await Attendance.find({
    date: { $gte: startOfDay, $lte: endOfDay }
  })
    .sort({ date: -1, _id: -1 })
    .populate({
      path: 'playerId',
      select: 'fullName parentId packageName packageClasses packageHours',
      populate: { path: 'parentId', select: 'name' }
    })
    .populate('groupId', 'name days startTime endTime')
    .lean();

  return attendance.map((record) => ({
    _id: normalizeId(record._id),
    playerId: normalizeId(record.playerId),
    playerName: record.playerId?.fullName || '',
    parentName: record.playerId?.parentId?.name || '',
    groupId: normalizeId(record.groupId),
    groupName: record.groupId?.name || '',
    packageName: record.playerId?.packageName || '',
    packageClasses: Number(record.playerId?.packageClasses || 0),
    packageHours: Number(record.playerId?.packageHours || 0),
    date: record.date || null,
    checkInTime: record.checkInTime || null,
    status: record.status || ''
  }));
};

const restoreStateAt = async (entityType, asOf) => {
  if (entityType === 'attendance') {
    return loadAttendanceForDate(asOf);
  }

  const baseState = entityType === 'player'
    ? await loadCurrentPlayerSnapshots()
    : await loadCurrentPaymentSnapshots();

  const stateMap = new Map(baseState.map((item) => [String(item._id), item]));
  const futureEvents = await HistoryEntry.find({
    entityType,
    changedAt: { $gt: asOf }
  })
    .sort({ changedAt: -1, _id: -1 })
    .lean();

  futureEvents.forEach((event) => {
    const entityKey = String(event.entityId);

    if (event.action === 'create') {
      stateMap.delete(entityKey);
      return;
    }

    if (event.action === 'update' || event.action === 'delete') {
      if (event.before) {
        stateMap.set(entityKey, event.before);
      } else {
        stateMap.delete(entityKey);
      }
    }
  });

  const rows = [...stateMap.values()];

  if (entityType === 'player') {
    return rows
      .filter((player) => {
        const createdAt = player.createdAt ? new Date(player.createdAt) : null;
        return !player.isDeleted && (!createdAt || createdAt <= asOf);
      })
      .sort((a, b) => {
        const createdAtDiff = new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        if (createdAtDiff !== 0) {
          return createdAtDiff;
        }
        return String(b._id || '').localeCompare(String(a._id || ''));
      });
  }

  const paymentsByPlayer = new Map();
  rows.forEach((payment) => {
    const playerKey = String(payment.playerId || 'unknown');
    if (!paymentsByPlayer.has(playerKey)) {
      paymentsByPlayer.set(playerKey, []);
    }
    paymentsByPlayer.get(playerKey).push({ ...payment });
  });

  const normalizedPayments = [];
  paymentsByPlayer.forEach((payments) => {
    payments
      .sort((a, b) => new Date(a.paymentDate || 0) - new Date(b.paymentDate || 0))
      .reduce((runningPaid, payment) => {
        const nextPaid = runningPaid + Number(payment.paidAmount || 0);
        normalizedPayments.push({
          ...payment,
          remainingAmount: payment.totalAmount
            ? Math.max(0, Number(payment.totalAmount || 0) - nextPaid)
            : 0
        });
        return nextPaid;
      }, 0);
  });

  return normalizedPayments.sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));
};

module.exports = {
  snapshotPlayerDocument,
  snapshotPaymentDocument,
  createHistoryEntry,
  restoreStateAt,
  loadAttendanceForDate,
  ensureHistoryBaseline,
  ensureHistoryBaselines,
  getHistoryAvailableSince
};
