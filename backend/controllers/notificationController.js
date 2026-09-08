const Notification = require('../models/Notification');
const SavedNotificationMessage = require('../models/SavedNotificationMessage');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');

const adminNotificationRoles = ['admin', 'coach', 'receptionist'];

const getSavedMessages = async (req, res, next) => {
  try {
    const messages = await SavedNotificationMessage.find()
      .sort({ updatedAt: -1, createdAt: -1 })
      .populate('updatedBy', 'name email')
      .lean();
    res.json(messages);
  } catch (error) {
    next(error);
  }
};

const createSavedMessage = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { title, message } = payload;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required.' });
    }
    const savedMessage = await SavedNotificationMessage.create({
      title,
      message,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });
    await createAuditLog({ userId: req.user._id, action: 'create saved notification message', entity: 'SavedNotificationMessage', entityId: savedMessage._id, req });
    res.status(201).json(savedMessage);
  } catch (error) {
    next(error);
  }
};

const updateSavedMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid saved message ID.' });
    }
    const payload = sanitizeObject(req.body);
    const { title, message } = payload;
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required.' });
    }
    const savedMessage = await SavedNotificationMessage.findByIdAndUpdate(
      id,
      { title, message, updatedBy: req.user._id },
      { new: true, runValidators: true }
    );
    if (!savedMessage) {
      return res.status(404).json({ message: 'Saved message not found.' });
    }
    await createAuditLog({ userId: req.user._id, action: 'update saved notification message', entity: 'SavedNotificationMessage', entityId: savedMessage._id, req });
    res.json(savedMessage);
  } catch (error) {
    next(error);
  }
};

const deleteSavedMessage = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) {
      return res.status(400).json({ message: 'Invalid saved message ID.' });
    }
    const savedMessage = await SavedNotificationMessage.findByIdAndDelete(id);
    if (!savedMessage) {
      return res.status(404).json({ message: 'Saved message not found.' });
    }
    await createAuditLog({ userId: req.user._id, action: 'delete saved notification message', entity: 'SavedNotificationMessage', entityId: savedMessage._id, req });
    res.json({ message: 'Saved message deleted successfully.' });
  } catch (error) {
    next(error);
  }
};

const getNotifications = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'parent') {
      filter.recipientUserId = req.user._id;
    } else if (req.query.userId && validateObjectId(req.query.userId)) {
      filter.recipientUserId = req.query.userId;
    }
    if (req.query.date) {
      const start = new Date(req.query.date);
      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        filter.createdAt = { $gte: start, $lt: end };
      }
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
    if (String(notification.recipientUserId?._id) !== String(req.user._id) && !adminNotificationRoles.includes(req.user.role)) {
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

module.exports = {
  getNotifications,
  getNotificationById,
  getUnreadNotificationCount,
  getSavedMessages,
  createSavedMessage,
  updateSavedMessage,
  deleteSavedMessage,
  createNotification,
  announceAllParents,
  announceGroupParents
};
