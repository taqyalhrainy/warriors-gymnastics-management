const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const { getAppDateOnly } = require('./appDate');

const getAttendanceRetentionCutoff = () => {
  const cutoff = getAppDateOnly();
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  return cutoff;
};

const cleanupOldAttendanceData = async () => {
  const cutoff = getAttendanceRetentionCutoff();
  const [attendanceResult, notificationResult] = await Promise.all([
    Attendance.deleteMany({ date: { $lt: cutoff } }),
    Notification.deleteMany({ type: 'attendance', createdAt: { $lt: cutoff } })
  ]);

  return {
    cutoff,
    deletedAttendance: attendanceResult.deletedCount || 0,
    deletedNotifications: notificationResult.deletedCount || 0
  };
};

module.exports = { cleanupOldAttendanceData, getAttendanceRetentionCutoff };
