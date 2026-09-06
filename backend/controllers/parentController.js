const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const Attendance = require('../models/Attendance');
const Payment = require('../models/Payment');
const Notification = require('../models/Notification');
const { sanitizeObject, validateEmail, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { encrypt, decrypt } = require('../utils/encryption');

const isSubscriptionPaymentType = (value) => ['full payment', 'partial payment'].includes(String(value || '').trim().toLowerCase());

const isOnOrAfter = (value, date) => {
  if (!value || !date) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed >= date;
};

const getCurrentSubscriptionStart = (player) => {
  const rawDate = player?.currentSubscriptionStartedAt || player?.startDate || player?.subscriptionId?.startDate;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCurrentSubscriptionPaymentMatch = (player) => {
  const match = { playerId: player._id, transactionType: { $in: ['Full payment', 'Partial payment'] } };
  const subscriptionStart = getCurrentSubscriptionStart(player);
  if (subscriptionStart) {
    match.$or = [
      { paymentDate: { $gte: subscriptionStart } },
      { createdAt: { $gte: subscriptionStart } }
    ];
  }
  return match;
};

const getPlayerPaymentTotal = (player) => Math.max(0, Number(player.previousDueBalance || 0)
  + Number(player.payment || 0)
  - Number(player.dueAdjustment || 0));

const formatParentResponse = (parent) => {
  const obj = parent.toObject({ virtuals: true });
  if (obj.phoneEncrypted) {
    try {
      obj.phone = decrypt(obj.phoneEncrypted);
    } catch (err) {
      obj.phone = '';
    }
  }
  delete obj.phoneEncrypted;
  return obj;
};

const getParents = async (req, res, next) => {
  try {
    const parents = await Parent.find()
      .sort({ _id: -1 })
      .populate('userId', 'name email role isActive')
      .populate('children', 'fullName profileImage status programId groupId groupIds subscriptionId');
    const childCounts = await Player.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$parentId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(childCounts.map((item) => [String(item._id), item.count]));
    res.json(parents.map((parent) => ({
      ...formatParentResponse(parent),
      childrenCount: countMap.get(String(parent._id)) || 0
    })));
  } catch (error) {
    next(error);
  }
};

const getParentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid parent ID.' });
    }
    const parent = await Parent.findById(id)
      .populate('userId', 'name email role isActive')
      .populate('children', 'fullName profileImage status programId groupId groupIds subscriptionId');
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    res.json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const createParent = async (req, res, next) => {
  try {
    const body = sanitizeObject(req.body);
    const { name, password, phone = '', isActive } = body;
    const email = body.email?.toLowerCase().trim();
    if (!name || !password) {
      return res.status(400).json({ message: 'Name and password are required.' });
    }
    if (email && !validateEmail(email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    if (email && await User.findOne({ email })) {
      return res.status(409).json({ message: 'Email already registered.' });
    }
    const existingParentName = await User.findOne({
      role: 'parent',
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    });
    if (existingParentName) {
      return res.status(409).json({ message: 'A parent with this name already exists. Please use a unique login name.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const internalEmail = email || `parent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@warriors.local`;
    const user = await User.create({ name, email: internalEmail, passwordHash, role: 'parent', phone, isActive: isActive !== false });
    const parent = await Parent.create({
      userId: user._id,
      name,
      phoneEncrypted: phone ? encrypt(phone) : '',
      email: email || '',
      children: []
    });
    await createAuditLog({ userId: req.user._id, action: 'create parent', entity: 'Parent', entityId: parent._id, req });
    res.status(201).json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const updateParent = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid parent ID.' });
    }
    const body = sanitizeObject(req.body);
    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    if (body.email && !validateEmail(body.email)) {
      return res.status(400).json({ message: 'Invalid email address.' });
    }
    const user = await User.findById(parent.userId);
    if (!user) {
      return res.status(404).json({ message: 'Parent user not found.' });
    }
    if (body.name) {
      user.name = body.name;
      parent.name = body.name;
    }
    if (body.email) {
      user.email = body.email;
      parent.email = body.email;
    }
    if (typeof body.isActive === 'boolean') {
      user.isActive = body.isActive;
    }
    if (typeof body.phone !== 'undefined') {
      user.phone = body.phone;
      parent.phoneEncrypted = body.phone ? encrypt(body.phone) : '';
    }
    if (body.password) {
      user.passwordHash = await bcrypt.hash(body.password, 12);
    }
    await user.save();
    await parent.save();
    await createAuditLog({ userId: req.user._id, action: 'update parent', entity: 'Parent', entityId: parent._id, req });
    res.json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const deleteParent = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid parent ID.' });
    }
    const parent = await Parent.findById(id);
    if (!parent) {
      return res.status(404).json({ message: 'Parent not found.' });
    }
    const activeChildrenCount = await Player.countDocuments({ parentId: parent._id, isDeleted: { $ne: true } });
    if (activeChildrenCount > 0) {
      return res.status(400).json({ message: 'Cannot delete a parent with active children.' });
    }
    const user = await User.findById(parent.userId);
    await parent.deleteOne();
    if (user) {
      await user.deleteOne();
    }
    await createAuditLog({ userId: req.user._id, action: 'delete parent', entity: 'Parent', entityId: parent._id, req });
    res.json({ message: 'Parent deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const getParentMe = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id })
      .populate('children', 'fullName profileImage status programId groupId groupIds subscriptionId');
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    res.json(formatParentResponse(parent));
  } catch (error) {
    next(error);
  }
};

const getParentChildren = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName dateOfBirth profileImage status programId groupId groupIds subscriptionId')
      .populate('programId', 'name level')
      .populate('groupId', 'name')
      .populate('groupIds', 'name')
      .populate('subscriptionId', 'type status remainingSessions startDate endDate price');
    res.json(children);
  } catch (error) {
    next(error);
  }
};

const getParentAttendance = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName dateOfBirth profileImage startDate endDate packageName packageClasses packageHours payment currentSubscriptionStartedAt currentSubscriptionAttendanceIds currentSubscriptionExcludedAttendanceIds subscriptionId')
      .populate('subscriptionId', 'totalSessions usedSessions remainingSessions startDate endDate status price');
    const childIds = children.map((child) => child._id);
    const attendance = await Attendance.find({ playerId: { $in: childIds } }).sort({ date: -1, _id: -1 }).populate('playerId', 'fullName profileImage');
    res.json({ children, attendance });
  } catch (error) {
    next(error);
  }
};

const getParentPayments = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName startDate payment previousDueBalance dueAdjustment currentSubscriptionStartedAt');
    const childIds = children.map((child) => child._id);
    const payments = await Payment.find({ playerId: { $in: childIds } })
      .sort({ paymentDate: -1, _id: -1 })
      .populate('playerId', 'fullName profileImage startDate payment previousDueBalance dueAdjustment currentSubscriptionStartedAt')
      .populate('subscriptionId', 'price')
      .lean();
    const remainingByPlayer = new Map();

    await Promise.all(children.map(async (child) => {
      const paidRows = await Payment.find(getCurrentSubscriptionPaymentMatch(child)).select('paidAmount').lean();
      const totalAmount = getPlayerPaymentTotal(child);
      const paidAmount = paidRows.reduce((sum, payment) => sum + Number(payment.paidAmount || 0), 0);
      remainingByPlayer.set(String(child._id), Math.max(0, totalAmount - paidAmount));
    }));

    res.json(payments.map((payment) => {
      const playerId = String(payment.playerId?._id || payment.playerId || '');
      return isSubscriptionPaymentType(payment.transactionType)
        ? { ...payment, remainingAmount: remainingByPlayer.get(playerId) || 0 }
        : { ...payment, remainingAmount: 0 };
    }));
  } catch (error) {
    next(error);
  }
};

const getParentDashboard = async (req, res, next) => {
  try {
    const parent = await Parent.findOne({ userId: req.user._id });
    if (!parent) {
      return res.status(404).json({ message: 'Parent record not found.' });
    }
    const children = await Player.find({ parentId: parent._id })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id fullName dateOfBirth profileImage status programId groupId groupIds coachId subscriptionId startDate endDate packageName packageClasses packageHours payment previousDueBalance dueAdjustment currentSubscriptionStartedAt')
      .populate('programId', 'name')
      .populate('groupId', 'name')
      .populate('groupIds', 'name')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status remainingSessions usedSessions startDate endDate price');
    const childIds = children.map((child) => child._id);
    const attendanceRecords = await Attendance.find({ playerId: { $in: childIds } })
      .populate('playerId', 'fullName profileImage')
      .sort({ date: -1, _id: -1 });
    const payments = await Payment.find({ playerId: { $in: childIds } })
      .populate('playerId', 'fullName profileImage')
      .populate('subscriptionId', 'price')
      .sort({ paymentDate: -1, _id: -1 });
    const childById = new Map(children.map((child) => [String(child._id), child]));
    const paymentGroups = payments.reduce((acc, payment) => {
      const child = childById.get(String(payment.playerId?._id || payment.playerId || ''));
      const subscriptionStart = child ? getCurrentSubscriptionStart(child) : null;
      if (
        child
        && subscriptionStart
        && !isOnOrAfter(payment.paymentDate, subscriptionStart)
        && !isOnOrAfter(payment.createdAt, subscriptionStart)
      ) {
        return acc;
      }
      const key = payment.subscriptionId?._id?.toString() || payment.playerId._id.toString();
      acc[key] = (acc[key] || 0) + payment.paidAmount;
      return acc;
    }, {});
    const childSummaries = children.map((child) => {
      const subscription = child.subscriptionId || {};
      const paidTotal = paymentGroups[subscription._id?.toString()] || 0;
      const latestAttendance = attendanceRecords.find((att) => att.playerId._id.toString() === child._id.toString());
      const daysRemaining = subscription.type === 'time' && subscription.endDate
        ? Math.max(0, Math.ceil((subscription.endDate - new Date()) / (1000 * 60 * 60 * 24)))
        : null;
      return {
        ...child.toObject({ virtuals: true }),
        paidTotal,
        remainingAmount: subscription.price ? Math.max(0, subscription.price - paidTotal) : null,
        latestAttendance,
        daysRemaining
      };
    });
    const notifications = await Notification.find({ recipientUserId: req.user._id }).sort({ createdAt: -1 }).limit(10);
    res.json({ children: childSummaries, attendance: attendanceRecords, payments, notifications });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getParents,
  getParentById,
  createParent,
  updateParent,
  deleteParent,
  getParentMe,
  getParentChildren,
  getParentAttendance,
  getParentPayments,
  getParentDashboard
};
