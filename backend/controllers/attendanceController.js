const Attendance = require('../models/Attendance');
const Subscription = require('../models/Subscription');
const Player = require('../models/Player');
const Notification = require('../models/Notification');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const markPresent = async (req, res, next) => {
  try {
    const { playerId, groupId } = sanitizeObject(req.body);
    if (!validateObjectId(playerId) || !validateObjectId(groupId)) {
      return res.status(400).json({ message: 'Valid player and group IDs are required.' });
    }
    const today = new Date();
    const dateOnly = new Date(today.toISOString().split('T')[0]);
    const existing = await Attendance.findOne({ playerId, date: dateOnly });
    if (existing) {
      return res.status(400).json({ message: 'Attendance already marked for this player today.' });
    }
    const player = await Player.findById(playerId).populate({ path: 'parentId', populate: { path: 'userId', select: '_id' } });
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const subscription = await Subscription.findOne({ playerId });
    if (subscription) {
      if (subscription.type === 'sessions' && subscription.remainingSessions > 0) {
        subscription.usedSessions += 1;
        subscription.remainingSessions = Math.max(0, subscription.remainingSessions - 1);
      }
      subscription.lastAttendanceDate = today;
      if (subscription.endDate <= today || subscription.remainingSessions === 0) {
        subscription.status = 'expired';
      } else if (subscription.remainingSessions <= 2) {
        subscription.status = 'almost_expired';
      }
      await subscription.save();
    }
    const attendance = await Attendance.create({
      playerId,
      groupId,
      date: dateOnly,
      checkInTime: today,
      status: 'present',
      markedBy: req.user._id
    });
    if (player.parentId?.userId) {
      const attendanceTime = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      await Notification.create({
        recipientUserId: player.parentId.userId._id,
        playerId: player._id,
        title: 'Attendance Registered',
        message: `تم تسجيل حضور ابنتكم ${player.fullName} في نادي Warriors Gymnastics الساعة ${attendanceTime}.`,
        type: 'attendance',
        isRead: false
      });
    }
    await createAuditLog({ userId: req.user._id, action: 'attendance present', entity: 'Attendance', entityId: attendance._id, req });
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

const markAbsent = async (req, res, next) => {
  try {
    const { playerId, groupId } = sanitizeObject(req.body);
    if (!validateObjectId(playerId) || !validateObjectId(groupId)) {
      return res.status(400).json({ message: 'Valid player and group IDs are required.' });
    }
    const today = new Date();
    const dateOnly = new Date(today.toISOString().split('T')[0]);
    const existing = await Attendance.findOne({ playerId, date: dateOnly });
    if (existing) {
      return res.status(400).json({ message: 'Attendance already marked for this player today.' });
    }
    const attendance = await Attendance.create({
      playerId,
      groupId,
      date: dateOnly,
      status: 'absent',
      markedBy: req.user._id
    });
    await createAuditLog({ userId: req.user._id, action: 'attendance absent', entity: 'Attendance', entityId: attendance._id, req });
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

const getAttendanceByPlayer = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    if (!validateObjectId(playerId)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const attendance = await Attendance.find({ playerId }).sort({ date: -1 });
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

const getAttendanceByGroup = async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!validateObjectId(groupId)) {
      return res.status(400).json({ message: 'Invalid group ID.' });
    }
    const attendance = await Attendance.find({ groupId }).populate('playerId', 'fullName');
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

module.exports = { markPresent, markAbsent, getAttendanceByPlayer, getAttendanceByGroup };
