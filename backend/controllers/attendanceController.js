const Attendance = require('../models/Attendance');
const Player = require('../models/Player');
require('../models/Parent');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { synchronizeSubscriptionAttendanceUsage } = require('../utils/subscriptionAttendance');
const { createNotification } = require('../utils/notificationDelivery');
const { getAppDateKey, dateKeyToUtc } = require('../utils/appDate');

const toStoredDateKey = (date) => new Date(date).toISOString().split('T')[0];

const getAttendanceDateOnly = (value) => {
  if (value == null || value === '') return dateKeyToUtc(getAppDateKey());
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isFinite(date.getTime()) && toStoredDateKey(date) === value) return date;
  }
  const error = new Error('Invalid attendance date.');
  error.statusCode = 400;
  throw error;
};

const getAttendanceRangeStart = () => {
  const start = dateKeyToUtc(getAppDateKey());
  start.setUTCMonth(start.getUTCMonth() - 3);
  return start;
};

const validateAttendanceDateInRange = (dateOnly) => {
  if (dateOnly < getAttendanceRangeStart()) {
    const error = new Error('Attendance date is out of range. Maximum range is 3 months.');
    error.statusCode = 400;
    throw error;
  }
};

const safelyRunAttendanceSideEffect = async (label, callback) => {
  try {
    await callback();
  } catch (error) {
    console.error(`Attendance ${label} failed:`, error);
  }
};

const markPresent = async (req, res, next) => {
  try {
    const { playerId, groupId } = sanitizeObject(req.body);
    if (!validateObjectId(playerId) || !validateObjectId(groupId)) {
      return res.status(400).json({ message: 'Valid player and group IDs are required.' });
    }
    const today = new Date();
    const dateOnly = dateKeyToUtc(getAppDateKey(today));
    const existing = await Attendance.findOne({ playerId, groupId, date: dateOnly });
    if (existing) {
      return res.status(400).json({ message: 'Attendance already marked for this player today.' });
    }
    const player = await Player.findById(playerId).populate({ path: 'parentId', populate: { path: 'userId', select: '_id' } });
    if (!player || player.isDeleted) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const attendance = await Attendance.create({
      playerId,
      groupId,
      date: dateOnly,
      checkInTime: today,
      status: 'present',
      markedBy: req.user._id
    });
    const attendanceTime = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
    await Promise.all([
      safelyRunAttendanceSideEffect('subscription synchronization', () => synchronizeSubscriptionAttendanceUsage(player, today)),
      player.parentId?.userId ? safelyRunAttendanceSideEffect('notification', () => createNotification({
        recipientUserId: player.parentId.userId._id,
        playerId: player._id,
        title: 'Attendance Registered',
        message: `تم تسجيل حضور ابنتكم ${player.fullName} في نادي Warriors Gymnastics الساعة ${attendanceTime}.`,
        type: 'attendance',
        isRead: false
      }, { waitForPush: false })) : Promise.resolve(),
      safelyRunAttendanceSideEffect('audit log', () => createAuditLog({ userId: req.user._id, action: 'attendance present', entity: 'Attendance', entityId: attendance._id, req }))
    ]);
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
    const dateOnly = dateKeyToUtc(getAppDateKey(today));
    const existing = await Attendance.findOne({ playerId, groupId, date: dateOnly });
    if (existing) {
      return res.status(400).json({ message: 'Attendance already marked for this player today.' });
    }
    const player = await Player.findById(playerId);
    if (!player || player.isDeleted) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    const attendance = await Attendance.create({
      playerId,
      groupId,
      date: dateOnly,
      status: 'absent',
      markedBy: req.user._id
    });
    await Promise.all([
      safelyRunAttendanceSideEffect('subscription synchronization', () => synchronizeSubscriptionAttendanceUsage(player, today)),
      safelyRunAttendanceSideEffect('audit log', () => createAuditLog({ userId: req.user._id, action: 'attendance absent', entity: 'Attendance', entityId: attendance._id, req }))
    ]);
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

const updateTodayAttendance = async (req, res, next) => {
  try {
    const { playerId, groupId, status, date } = sanitizeObject(req.body);
    if (!validateObjectId(playerId) || !validateObjectId(groupId) || !['present', 'absent'].includes(status)) {
      return res.status(400).json({ message: 'Valid player, group, and attendance status are required.' });
    }

    const today = new Date();
    const dateOnly = getAttendanceDateOnly(date);
    validateAttendanceDateInRange(dateOnly);
    const isCurrentDate = toStoredDateKey(dateOnly) === getAppDateKey(today);
    const player = await Player.findById(playerId).populate({ path: 'parentId', populate: { path: 'userId', select: '_id' } });
    if (!player || player.isDeleted) {
      return res.status(404).json({ message: 'Player not found.' });
    }

    const query = { playerId, groupId, date: dateOnly };
    const existing = await Attendance.findOne(query);
    const change = { $set: { status, markedBy: req.user._id } };
    if (status === 'present') change.$set.checkInTime = existing?.checkInTime || (isCurrentDate ? today : dateOnly);
    else change.$unset = { checkInTime: 1 };
    // The pre-update status atomically identifies the request that should notify.
    let previous;
    try {
      previous = await Attendance.findOneAndUpdate(query, change, { upsert: true, new: false, runValidators: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      previous = await Attendance.findOneAndUpdate(query, change, { new: false, runValidators: true });
    }
    const previousStatus = previous?.status;
    const attendance = await Attendance.findOne(query);

    const shouldNotify = isCurrentDate && status === 'present' && previousStatus !== 'present' && player.parentId?.userId;
    const attendanceTime = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
    await Promise.all([
      safelyRunAttendanceSideEffect('subscription synchronization', () => synchronizeSubscriptionAttendanceUsage(player, today)),
      shouldNotify ? safelyRunAttendanceSideEffect('notification', () => createNotification({
        recipientUserId: player.parentId.userId._id,
        playerId: player._id,
        title: 'Attendance Registered',
        message: `تم تسجيل حضور ابنكم ${player.fullName} في نادي Warriors Gymnastics الساعة ${attendanceTime}.`,
        type: 'attendance',
        isRead: false
      }, { waitForPush: false })) : Promise.resolve(),
      safelyRunAttendanceSideEffect('audit log', () => createAuditLog({ userId: req.user._id, action: `attendance ${status}`, entity: 'Attendance', entityId: attendance._id, req }))
    ]);
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

const cancelTodayAttendance = async (req, res, next) => {
  try {
    const { playerId, groupId, date } = sanitizeObject(req.body);
    if (!validateObjectId(playerId)) {
      return res.status(400).json({ message: 'Valid player ID is required.' });
    }
    if (groupId && !validateObjectId(groupId)) {
      return res.status(400).json({ message: 'Valid group ID is required.' });
    }

    const today = new Date();
    const dateOnly = getAttendanceDateOnly(date);
    validateAttendanceDateInRange(dateOnly);
    const attendanceQuery = { playerId, date: dateOnly };
    if (groupId) {
      attendanceQuery.groupId = groupId;
    }
    const attendance = await Attendance.findOne(attendanceQuery);
    if (!attendance) {
      return res.status(404).json({ message: 'No attendance record to cancel today.' });
    }

    await attendance.deleteOne();
    const player = await Player.findById(playerId);
    await Promise.all([
      safelyRunAttendanceSideEffect('subscription synchronization', () => synchronizeSubscriptionAttendanceUsage(player, today)),
      safelyRunAttendanceSideEffect('audit log', () => createAuditLog({ userId: req.user._id, action: 'attendance cancel', entity: 'Attendance', entityId: attendance._id, req }))
    ]);
    res.json({ message: 'Attendance cancelled successfully.' });
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
    const attendance = await Attendance.find({ playerId }).sort({ date: -1, _id: -1 });
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

const getTodayAttendance = async (req, res, next) => {
  try {
    const dateOnly = getAttendanceDateOnly(req.query.date);
    validateAttendanceDateInRange(dateOnly);
    const attendance = await Attendance.find({ date: dateOnly }).sort({ _id: -1 });
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
    const attendance = await Attendance.find({ groupId }).sort({ date: -1, _id: -1 }).populate('playerId', 'fullName');
    res.json(attendance);
  } catch (error) {
    next(error);
  }
};

module.exports = { markPresent, markAbsent, updateTodayAttendance, cancelTodayAttendance, getAttendanceByPlayer, getTodayAttendance, getAttendanceByGroup };
