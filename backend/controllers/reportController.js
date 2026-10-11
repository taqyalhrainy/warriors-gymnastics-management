const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const TrainingGroup = require('../models/TrainingGroup');
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

const getOwnerSummary = async (req, res, next) => {
  try {
    const today = getAppDateOnly();
    const [players, groups, todayAttendance] = await Promise.all([
      Player.find({ isDeleted: { $ne: true } })
        .select('_id fullName parentId parentPhoneEncrypted groupId groupIds status showInAttendanceWhenFrozen packageName packageClasses packageHours payment previousDueBalance dueAdjustment attendanceDueManual startDate currentSubscriptionStartedAt currentSubscriptionCreatedAt currentSubscriptionPaymentConfirmedAt createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .populate('parentId', 'name phoneEncrypted')
        .populate('groupId', 'name days startTime endTime color')
        .populate('groupIds', 'name days startTime endTime color')
        .lean(),
      TrainingGroup.find().select('name days startTime endTime color displayOrder').sort({ displayOrder: 1, _id: -1 }).lean(),
      Attendance.find({ date: today }).select('_id playerId groupId date checkInTime status').lean()
    ]);

    const playerIds = players.map((player) => player._id);
    const subscriptionStarts = players
      .map((player) => getCurrentSubscriptionStart(player) || player.createdAt)
      .filter(Boolean)
      .map((date) => new Date(date))
      .filter((date) => !Number.isNaN(date.getTime()));
    const earliestStart = subscriptionStarts.length
      ? new Date(Math.min(...subscriptionStarts.map((date) => date.getTime())))
      : null;
    const paymentFilter = {
      isDeleted: { $ne: true },
      playerId: { $in: playerIds },
      transactionType: { $in: ['Full payment', 'Partial payment'] }
    };
    if (earliestStart) {
      paymentFilter.$or = [
        { createdAt: { $gte: earliestStart } },
        { paymentDate: { $gte: earliestStart } }
      ];
    }
    const payments = playerIds.length
      ? await Payment.find(paymentFilter).select('playerId paidAmount paymentDate createdAt').lean()
      : [];

    const paymentsByPlayer = new Map();
    for (const payment of payments) {
      const playerId = String(payment.playerId || '');
      if (!paymentsByPlayer.has(playerId)) paymentsByPlayer.set(playerId, []);
      paymentsByPlayer.get(playerId).push(payment);
    }

    const formattedPlayers = players.map((player) => {
      const subscriptionStart = getCurrentSubscriptionStart(player) || player.createdAt;
      const startTime = new Date(subscriptionStart || 0).getTime();
      const currentSubscriptionPaidAmount = (paymentsByPlayer.get(String(player._id)) || [])
        .filter((payment) => {
          const paymentTime = new Date(payment.createdAt || payment.paymentDate || 0).getTime();
          return !Number.isNaN(paymentTime) && !Number.isNaN(startTime) && paymentTime >= startTime;
        })
        .reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
      const parentPhone = safeDecrypt(player.parentPhoneEncrypted) || safeDecrypt(player.parentId?.phoneEncrypted);
      const parent = player.parentId ? { ...player.parentId, phone: parentPhone } : null;
      if (parent) delete parent.phoneEncrypted;
      const result = {
        ...player,
        parentId: parent,
        parentPhone,
        currentSubscriptionPaidAmount,
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
          ...player,
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

module.exports = { getDashboardReport, getRevenueReport, getAttendanceReport, getOwnerSummary, clearDashboardReportCache };
