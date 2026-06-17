const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');

const getAttendanceRetentionCutoff = () => {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  cutoff.setHours(0, 0, 0, 0);
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
