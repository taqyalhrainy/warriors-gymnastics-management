const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
require('../models/Subscription');
const { getAppDateKey, getAppDateOnly, dateKeyToUtc } = require('../utils/appDate');
const { getCurrentSubscriptionStart } = require('../utils/subscriptionCycle');
const { getRemainingAmount } = require('../utils/manualRemaining');

const clearDashboardReportCache = () => {};
const monthStart = () => dateKeyToUtc(`${getAppDateKey().slice(0, 7)}-01`);

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
      Payment.aggregate([{ $match: { paymentDate: { $gte: monthStart() } } }, { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }])
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
      Payment.aggregate([{ $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }]),
      Payment.aggregate([{ $match: { paymentDate: { $gte: monthStart() } } }, { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }])
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

module.exports = { getDashboardReport, getRevenueReport, getAttendanceReport, clearDashboardReportCache };
