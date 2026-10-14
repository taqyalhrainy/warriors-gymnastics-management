const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const TrainingGroup = require('../models/TrainingGroup');
const HistoryEntry = require('../models/HistoryEntry');
require('../models/Subscription');
const { getAppDateKey, getAppDateOnly, getAppDayStartUtc } = require('../utils/appDate');
const { getCurrentSubscriptionStart } = require('../utils/subscriptionCycle');
const { getRemainingAmount } = require('../utils/manualRemaining');
const { decrypt } = require('../utils/encryption');

const clearDashboardReportCache = () => {};
const monthStart = () => getAppDayStartUtc(`${getAppDateKey().slice(0, 7)}-01`);

const getCurrentPlayerSummaries = async () => {
  const players = await Player.find({ isDeleted: { $ne: true }, status: { $ne: 'left' } })
    .select('_id status subscriptionId startDate endDate currentSubscriptionStartedAt packageClasses payment previousDueBalance dueAdjustment attendanceDueManual preservedRemainingBalance subscriptionNeedsAttention currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds')
    .populate('subscriptionId', 'type startDate endDate totalSessions price').lean();
  const ids = players.map((player) => player._id);
  const attendance = await Attendance.find({ playerId: { $in: ids }, status: 'present' }).select('_id playerId date').lean();
  const byPlayer = new Map(players.map((player) => [String(player._id), { player, dates: new Set(),
    start: getCurrentSubscriptionStart(player),
    included: new Set((player.currentSubscriptionAttendanceIds || []).map(String)),
    excluded: new Set((player.currentSubscriptionExcludedAttendanceIds || []).map(String)) }]));
  for (const record of attendance) {
    const row = byPlayer.get(String(record.playerId));
    if (!row || row.excluded.has(String(record._id))) continue;
    if (!row.start || row.included.has(String(record._id)) || getAppDateOnly(record.date) >= getAppDateOnly(row.start)) {
      row.dates.add(getAppDateKey(record.date));
    }
  }
  const today = getAppDateOnly();
  return [...byPlayer.values()].map(({ player, dates }) => {
    const total = Number(player.packageClasses || player.subscriptionId?.totalSessions || 0);
    const end = player.endDate || player.subscriptionId?.endDate;
    const days = end ? Math.ceil((getAppDateOnly(end) - today) / 86400000) : null;
    const frozen = player.status === 'frozen';
    const expired = !frozen && (player.status === 'expired' || player.subscriptionNeedsAttention
      || (days !== null && days <= 0) || (total > 0 && dates.size >= total));
    const soon = !frozen && !expired && ((total > 0 && total - dates.size <= 2) || (days !== null && days <= 7));
    const remaining = getRemainingAmount(player);
    return { player, expired, soon, remaining };
  });
};

const getDashboardReport = async (req, res, next) => {
  try {
    const [players, attendanceCounts, monthlyRevenue] = await Promise.all([
      getCurrentPlayerSummaries(),
      Attendance.aggregate([
        { $match: { date: getAppDateOnly(), status: { $in: ['present', 'absent'] } } },
        { $group: { _id: { status: '$status', player: '$playerId' } } },
        { $group: { _id: '$_id.status', count: { $sum: 1 } } }
      ]),
      Payment.aggregate([{ $match: { isDeleted: { $ne: true }, paymentDate: { $gte: monthStart() } } }, { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }])
    ]);
    const counts = Object.fromEntries(attendanceCounts.map((row) => [row._id, row.count]));
    res.json({
      activePlayers: players.filter(({ player }) => player.status === 'active').length,
      expiredSubscriptions: players.filter((row) => row.expired).length,
      soonSubscriptions: players.filter((row) => row.soon).length,
      presentCount: counts.present || 0,
      absentCount: counts.absent || 0,
      monthlyRevenue: monthlyRevenue[0]?.totalPaid || 0,
      pendingAmounts: players.filter(({ player, expired }) => !expired && player.status !== 'frozen')
        .reduce((sum, row) => sum + row.remaining, 0)
    });
  } catch (error) { next(error); }
};

const getRevenueReport = async (req, res, next) => {
  try {
    const [players, totalRevenue, monthlyRevenue] = await Promise.all([
      getCurrentPlayerSummaries(),
      Payment.aggregate([{ $match: { isDeleted: { $ne: true } } }, { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }]),
      Payment.aggregate([{ $match: { isDeleted: { $ne: true }, paymentDate: { $gte: monthStart() } } }, { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }])
    ]);
    res.json({ totalPaid: totalRevenue[0]?.totalPaid || 0,
      totalRemaining: players.reduce((sum, row) => sum + row.remaining, 0),
      monthlyPaid: monthlyRevenue[0]?.totalPaid || 0 });
  } catch (error) { next(error); }
};

const getAttendanceReport = async (req, res, next) => {
  try {
    res.json(await Attendance.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]));
  } catch (error) { next(error); }
};

const safeDecrypt = (value) => {
  if (!value) return '';
  try { return decrypt(value); } catch (error) { return ''; }
};

const formatOwnerDateAuditLogs = (dateHistory) => dateHistory.map((entry) => {
  const changes = ['startDate', 'endDate']
    .filter((field) => entry.changedFields?.includes(field))
    .filter((field) => JSON.stringify(entry.before?.[field] ?? null) !== JSON.stringify(entry.after?.[field] ?? null))
    .map((field) => ({
      field,
      before: entry.before?.[field] || null,
      after: entry.after?.[field] || null
    }));
  return {
    _id: entry._id,
    playerId: entry.entityId,
    playerName: entry.after?.fullName || entry.before?.fullName || 'Unknown player',
    changedAt: entry.changedAt,
    changedBy: entry.changedBy ? {
      name: entry.changedBy.name || '',
      email: entry.changedBy.email || '',
      role: entry.changedBy.role || ''
    } : null,
    changes
  };
}).filter((entry) => entry.changes.length);

const getOwnerDateAudits = async (req, res, next) => {
  try {
    const dateHistory = await HistoryEntry.find({
      entityType: 'player',
      action: 'update',
      source: 'player-edit',
      changedFields: { $in: ['startDate', 'endDate'] }
    })
      .select('_id entityId changedFields changedAt changedBy before.fullName before.startDate before.endDate after.fullName after.startDate after.endDate')
      .sort({ changedAt: -1, _id: -1 })
      .limit(200)
      .populate('changedBy', 'name email role')
      .lean();
    res.json(formatOwnerDateAuditLogs(dateHistory));
  } catch (error) { next(error); }
};

const getOwnerSummary = async (req, res, next) => {
  try {
    const today = getAppDateOnly();
    const [players, groups, todayAttendance, paymentSummaries] = await Promise.all([
      Player.find({ isDeleted: { $ne: true } })
        .select('_id fullName parentId parentPhoneEncrypted groupId groupIds status showInAttendanceWhenFrozen packageName packageClasses packageHours payment startDate currentSubscriptionStartedAt currentSubscriptionCreatedAt currentSubscriptionPaymentConfirmedAt createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .populate('parentId', 'name phoneEncrypted')
        .lean(),
      TrainingGroup.find().select('name days startTime endTime color displayOrder').sort({ displayOrder: 1, _id: -1 }).lean(),
      Attendance.find({ date: today }).select('_id playerId groupId date checkInTime status').lean(),
      Payment.aggregate([
        {
          $match: {
            isDeleted: { $ne: true },
            transactionType: { $in: ['Full payment', 'Partial payment'] }
          }
        },
        {
          $lookup: {
            from: Player.collection.name,
            localField: 'playerId',
            foreignField: '_id',
            as: 'ownerPlayer'
          }
        },
        { $unwind: '$ownerPlayer' },
        { $match: { 'ownerPlayer.isDeleted': { $ne: true } } },
        {
          $set: {
            cycleCreatedAt: {
              $ifNull: [
                '$ownerPlayer.currentSubscriptionCreatedAt',
                { $ifNull: ['$ownerPlayer.currentSubscriptionStartedAt', { $ifNull: ['$ownerPlayer.startDate', '$ownerPlayer.createdAt'] }] }
              ]
            }
          }
        },
        { $match: { $expr: { $gte: ['$createdAt', '$cycleCreatedAt'] } } },
        { $group: { _id: '$playerId', paidAmount: { $sum: '$paidAmount' } } }
      ])
    ]);

    const groupsById = new Map(groups.map((group) => [String(group._id), group]));
    const resolveGroup = (group) => groupsById.get(String(group?._id || group)) || group;
    players.forEach((player) => {
      player.groupId = resolveGroup(player.groupId);
      player.groupIds = (player.groupIds || []).map(resolveGroup);
    });

    const paidByPlayer = new Map(paymentSummaries.map((row) => [String(row._id), Number(row.paidAmount || 0)]));

    const formattedPlayers = players.map((player) => {
      const subscriptionCreatedAt = player.currentSubscriptionCreatedAt || getCurrentSubscriptionStart(player) || player.createdAt;
      const currentSubscriptionPaidAmount = paidByPlayer.get(String(player._id)) || 0;
      const currentSubscriptionExpectedAmount = Number(player.payment || 0);
      const currentSubscriptionRemainingAmount = Math.max(
        0,
        currentSubscriptionExpectedAmount - currentSubscriptionPaidAmount
      );
      const parentPhone = safeDecrypt(player.parentPhoneEncrypted) || safeDecrypt(player.parentId?.phoneEncrypted);
      const parent = player.parentId ? { ...player.parentId, phone: parentPhone } : null;
      if (parent) delete parent.phoneEncrypted;
      const result = {
        ...player,
        parentId: parent,
        parentPhone,
        currentSubscriptionCreatedAt: subscriptionCreatedAt,
        currentSubscriptionExpectedAmount,
        currentSubscriptionPaidAmount,
        currentSubscriptionRemainingAmount,
        preservedRemainingBalance: 0
      };
      delete result.parentPhoneEncrypted;
      return result;
    });

    const attendanceByPlayerAndGroup = new Map(todayAttendance.map((record) => [
      `${String(record.playerId)}:${String(record.groupId)}`,
      record
    ]));
    const boardPlayers = formattedPlayers.filter((player) => (
      player.status !== 'left'
      && (player.status !== 'frozen' || player.showInAttendanceWhenFrozen !== false)
    ));
    const board = groups.map((group) => {
      const groupId = String(group._id);
      const groupPlayers = boardPlayers
        .filter((player) => {
          const ids = player.groupIds?.length ? player.groupIds : [player.groupId].filter(Boolean);
          return ids.some((item) => String(item?._id || item) === groupId);
        })
        .map((player) => ({
          _id: player._id,
          fullName: player.fullName,
          parentId: player.parentId ? { _id: player.parentId._id, name: player.parentId.name } : null,
          todayAttendance: attendanceByPlayerAndGroup.get(`${String(player._id)}:${groupId}`) || null
        }));
      return {
        ...group,
        color: group.color || '#c83fcb',
        players: groupPlayers,
        markedCount: groupPlayers.filter((player) => Boolean(player.todayAttendance)).length,
        presentCount: groupPlayers.filter((player) => player.todayAttendance?.status === 'present').length
      };
    });

    res.json({ players: formattedPlayers, board });
  } catch (error) { next(error); }
};

module.exports = { getDashboardReport, getRevenueReport, getAttendanceReport, getOwnerSummary, getOwnerDateAudits, clearDashboardReportCache };
