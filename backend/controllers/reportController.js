const Player = require('../models/Player');
const Subscription = require('../models/Subscription');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');

const DASHBOARD_CACHE_TTL_MS = 15 * 1000;
let dashboardReportCache = {
  timestamp: 0,
  data: null
};

const clearDashboardReportCache = () => {
  dashboardReportCache = {
    timestamp: 0,
    data: null
  };
};

const getDashboardReport = async (req, res, next) => {
  try {
    if (dashboardReportCache.data && (Date.now() - dashboardReportCache.timestamp) < DASHBOARD_CACHE_TTL_MS) {
      return res.json(dashboardReportCache.data);
    }

    const today = new Date();
    const todayOnly = new Date(today.toISOString().split('T')[0]);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      activePlayers,
      attendanceCounts,
      monthlyRevenue,
      paymentTotals,
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
      Payment.aggregate([
        { $group: { _id: '$subscriptionId', totalPaid: { $sum: '$paidAmount' } } }
      ]),
      Subscription.find({}, 'type status endDate price').lean()
    ]);

    const attendanceMap = attendanceCounts.reduce((map, item) => {
      map[item._id] = item.count;
      return map;
    }, {});
    const paidMap = paymentTotals.reduce((map, item) => {
      if (item._id) map[item._id.toString()] = item.totalPaid;
      return map;
    }, {});
    const normalized = subscriptions.map((subscription) => {
      const sub = { ...subscription };
      if (sub.type === 'time' && sub.endDate) {
        const endDate = new Date(sub.endDate);
        const daysRemaining = Math.max(0, Math.ceil((endDate - today) / (1000 * 60 * 60 * 24)));
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
      const paid = paidMap[subscription._id.toString()] || 0;
      const remaining = Math.max(0, subscription.price - paid);
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

    dashboardReportCache = {
      timestamp: Date.now(),
      data
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
