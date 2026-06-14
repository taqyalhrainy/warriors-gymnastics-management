const Notification = require('../models/Notification');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const getNotifications = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'parent') {
      filter.recipientUserId = req.user._id;
    } else if (req.query.userId && validateObjectId(req.query.userId)) {
      filter.recipientUserId = req.query.userId;
    }
    const notifications = await Notification.find(filter).sort({ createdAt: -1 }).populate('recipientUserId', 'name email');
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

const getNotificationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid notification ID.' });
    }
    const notification = await Notification.findById(id).populate('recipientUserId', 'name email');
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }
    if (String(notification.recipientUserId?._id) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    if (req.user.role === 'parent' && !notification.isRead) {
      notification.isRead = true;
      notification.viewedAt = new Date();
      await notification.save();
    }
    res.json(notification);
  } catch (error) {
    next(error);
  }
};

const getUnreadNotificationCount = async (req, res, next) => {
  try {
    const filter = { isRead: false };
    if (req.user.role === 'parent') {
      filter.recipientUserId = req.user._id;
    } else if (req.query.userId && validateObjectId(req.query.userId)) {
      filter.recipientUserId = req.query.userId;
    }
    const count = await Notification.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    next(error);
  }
};

const createNotification = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { recipientUserId, playerId, title, message, type } = payload;
    if (!recipientUserId || !title || !message) {
      return res.status(400).json({ message: 'Recipient, title, and message are required.' });
    }
    const notification = await Notification.create({
      recipientUserId,
      playerId,
      title,
      message,
      type
    });
    await createAuditLog({ userId: req.user._id, action: 'create notification', entity: 'Notification', entityId: notification._id, req });
    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
};

const announceAllParents = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { title, message, type } = payload;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required.' });
    }
    const parents = await Parent.find().populate('userId', 'isActive');
    const notifications = parents
      .filter((parent) => parent.userId && parent.userId.isActive)
      .map((parent) => ({
        recipientUserId: parent.userId._id,
        title,
        message,
        type: type || 'announcement',
        isRead: false
      }));
    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
    await createAuditLog({ userId: req.user._id, action: 'announce all parents', entity: 'Notification', entityId: null, req });
    res.json({ count: notifications.length });
  } catch (error) {
    next(error);
  }
};

const announceGroupParents = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { groupId, title, message, type } = payload;
    if (!validateObjectId(groupId) || !title || !message) {
      return res.status(400).json({ message: 'Group, title, and message are required.' });
    }

    const players = await Player.find({
      isDeleted: { $ne: true },
      $or: [{ groupId }, { groupIds: groupId }]
    })
      .populate({
        path: 'parentId',
        populate: { path: 'userId', select: 'isActive' }
      });

    const parentMap = new Map();
    players.forEach((player) => {
      const parent = player.parentId;
      const user = parent?.userId;
      if (user && user.isActive) {
        parentMap.set(String(user._id), user._id);
      }
    });

    const notifications = [...parentMap.values()].map((recipientUserId) => ({
      recipientUserId,
      title,
      message,
      type: type || 'announcement',
      isRead: false
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
    await createAuditLog({ userId: req.user._id, action: 'announce group parents', entity: 'Notification', entityId: null, req });
    res.json({ count: notifications.length });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNotifications, getNotificationById, getUnreadNotificationCount, createNotification, announceAllParents, announceGroupParents };
