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
      .populate('userId', 'name email role isActive')
      .populate('children', 'fullName status programId groupId subscriptionId');
    res.json(parents.map(formatParentResponse));
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
      .populate('children', 'fullName status programId groupId subscriptionId');
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
    if (parent.children && parent.children.length > 0) {
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
      .populate('children', 'fullName status programId groupId subscriptionId');
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
      .populate('programId', 'name level')
      .populate('groupId', 'name')
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
    const children = await Player.find({ parentId: parent._id }).select('_id fullName');
    const childIds = children.map((child) => child._id);
    const attendance = await Attendance.find({ playerId: { $in: childIds } }).populate('playerId', 'fullName');
    res.json(attendance);
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
    const children = await Player.find({ parentId: parent._id }).select('_id fullName');
    const childIds = children.map((child) => child._id);
    const payments = await Payment.find({ playerId: { $in: childIds } }).populate('playerId', 'fullName').populate('subscriptionId', 'price');
    res.json(payments);
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
      .populate('programId', 'name')
      .populate('groupId', 'name')
      .populate('coachId', 'name')
      .populate('subscriptionId', 'type status remainingSessions usedSessions startDate endDate price');
    const childIds = children.map((child) => child._id);
    const attendanceRecords = await Attendance.find({ playerId: { $in: childIds } })
      .populate('playerId', 'fullName')
      .sort({ date: -1 });
    const payments = await Payment.find({ playerId: { $in: childIds } })
      .populate('playerId', 'fullName')
      .populate('subscriptionId', 'price')
      .sort({ paymentDate: -1 });
    const paymentGroups = payments.reduce((acc, payment) => {
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
