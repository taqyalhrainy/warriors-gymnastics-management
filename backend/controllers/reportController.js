const Player = require('../models/Player');
const Subscription = require('../models/Subscription');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const { getAppDateKey, dateKeyToUtc } = require('../utils/appDate');
const { getCurrentSubscriptionStart } = require('../utils/subscriptionCycle');

const clearDashboardReportCache = () => {};

const getDashboardReport = async (req, res, next) => {
  try {
    const today = new Date();
    const todayOnly = dateKeyToUtc(getAppDateKey(today));
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const reportPlayers = await Player.find({
      isDeleted: { $ne: true },
      subscriptionId: { $ne: null }
    }).select('_id status subscriptionId currentSubscriptionStartedAt startDate previousDueBalance dueAdjustment attendanceDueManual').lean();
    const linkedSubscriptionIds = reportPlayers.map((player) => player.subscriptionId).filter(Boolean);
    const reportPlayerIds = reportPlayers.map((player) => player._id);

    const [
      activePlayers,
      attendanceCounts,
      monthlyRevenue,
      currentPlayerPayments,
      subscriptions
    ] = await Promise.all([
      Player.countDocuments({ status: 'active', isDeleted: { $ne: true } }),
      Attendance.aggregate([
        { $match: { date: todayOnly, status: { $in: ['present', 'absent'] } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Payment.aggregate([
        { $match: { paymentDate: { $gte: firstOfMonth } } },
        { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }
      ]),
      Payment.find({
        playerId: { $in: reportPlayerIds },
        transactionType: { $in: ['Full payment', 'Partial payment'] }
      }).select('playerId paidAmount paymentDate createdAt').lean(),
      Subscription.find({ _id: { $in: linkedSubscriptionIds } }, 'playerId type status endDate price').lean()
    ]);

    const attendanceMap = attendanceCounts.reduce((map, item) => {
      map[item._id] = item.count;
      return map;
    }, {});
    const reportPlayerMap = new Map(reportPlayers.map((player) => [String(player._id), player]));
    const paidMap = currentPlayerPayments.reduce((map, payment) => {
      const playerId = String(payment.playerId || '');
      const player = reportPlayerMap.get(playerId);
      if (!player) return map;
      const cycleStart = getCurrentSubscriptionStart(player);
      const belongsToCurrentCycle = !cycleStart
        || new Date(payment.paymentDate || 0) >= cycleStart
        || new Date(payment.createdAt || 0) >= cycleStart;
      if (belongsToCurrentCycle) map[playerId] = Number(map[playerId] || 0) + Number(payment.paidAmount || 0);
      return map;
    }, {});
    const normalized = subscriptions.map((subscription) => {
      const sub = { ...subscription };
      if (sub.type === 'time' && sub.endDate) {
        const endDateKey = getAppDateKey(sub.endDate);
        const daysRemaining = Math.max(0, Math.ceil((dateKeyToUtc(endDateKey) - todayOnly) / 86400000));
        if (daysRemaining <= 0) {
          sub.status = 'expired';
        } else if (daysRemaining <= 7) {
          sub.status = 'almost_expired';
        } else {
          sub.status = 'active';
        }
      }
      return sub;
    });
    const expiredSubscriptions = normalized.filter((sub) => sub.status === 'expired').length;
    const soonSubscriptions = normalized.filter((sub) => sub.status === 'almost_expired').length;
    const pendingAmounts = normalized.reduce((total, subscription) => {
      if (subscription.status !== 'active') return total;
      const player = reportPlayerMap.get(String(subscription.playerId));
      const paid = paidMap[String(subscription.playerId)] || 0;
      const manualDue = player?.attendanceDueManual
        ? Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0)
        : 0;
      const remaining = Math.max(0, Number(subscription.price || 0) - paid + manualDue);
      return total + remaining;
    }, 0);

    const data = {
      activePlayers,
      expiredSubscriptions,
      soonSubscriptions,
      presentCount: attendanceMap.present || 0,
      absentCount: attendanceMap.absent || 0,
      monthlyRevenue: monthlyRevenue[0]?.totalPaid || 0,
      pendingAmounts
    };

    res.json(data);
  } catch (error) {
    next(error);
  }
};

const getRevenueReport = async (req, res, next) => {
  try {
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const totalRevenue = await Payment.aggregate([
      { $group: { _id: null, totalPaid: { $sum: '$paidAmount' }, totalRemaining: { $sum: '$remainingAmount' } } }
    ]);
    const monthlyRevenue = await Payment.aggregate([
      { $match: { paymentDate: { $gte: firstOfMonth } } },
      { $group: { _id: null, totalPaid: { $sum: '$paidAmount' } } }
    ]);
    res.json({
      totalPaid: totalRevenue[0]?.totalPaid || 0,
      totalRemaining: totalRevenue[0]?.totalRemaining || 0,
      monthlyPaid: monthlyRevenue[0]?.totalPaid || 0
    });
  } catch (error) {
    next(error);
  }
};

const getAttendanceReport = async (req, res, next) => {
  try {
    const attendanceByStatus = await Attendance.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json(attendanceByStatus);
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardReport, getRevenueReport, getAttendanceReport, clearDashboardReportCache };
