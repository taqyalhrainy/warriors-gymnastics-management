const Notification = require('../models/Notification');
const SavedNotificationMessage = require('../models/SavedNotificationMessage');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const PushSubscription = require('../models/PushSubscription');
const NativePushToken = require('../models/NativePushToken');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { getVapidPublicKey, isPushConfigured, sendPushToUser } = require('../utils/pushNotifications');
const { isNativePushConfigured, sendNativePushToUser } = require('../utils/nativePushNotifications');
const { createNotification: createAndPushNotification, createNotifications } = require('../utils/notificationDelivery');

const adminNotificationRoles = ['admin', 'coach', 'receptionist'];

const getPushPublicKey = (req, res) => {
  res.json({ publicKey: getVapidPublicKey(), configured: isPushConfigured() });
};

const savePushSubscription = async (req, res, next) => {
  try {
    const subscription = sanitizeObject(req.body);
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'Invalid push subscription.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        userId: req.user._id,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        userAgent: req.get('user-agent') || '',
        updatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const deletePushSubscription = async (req, res, next) => {
  try {
    const subscription = sanitizeObject(req.body);
    if (!subscription?.endpoint) {
      return res.status(400).json({ message: 'Subscription endpoint is required.' });
    }

    await PushSubscription.deleteOne({ userId: req.user._id, endpoint: subscription.endpoint });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getPushStatus = async (req, res, next) => {
  try {
    const endpoint = String(req.query.endpoint || '');
    const filter = { userId: req.user._id };
    if (endpoint) filter.endpoint = endpoint;
    const count = await PushSubscription.countDocuments(filter);
    res.json({ configured: isPushConfigured(), subscribed: count > 0 });
  } catch (error) {
    next(error);
  }
};

const sendTestPushNotification = async (req, res, next) => {
  try {
    if (!isPushConfigured()) {
      return res.status(503).json({ message: 'Push is not configured on the server.' });
    }

    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== 'string' || !endpoint.trim()) {
      return res.status(400).json({ message: 'This device subscription endpoint is required.' });
    }

    const result = await sendPushToUser(req.user._id, {
      title: 'Warriors Gymnastics',
      body: 'This is your Warriors Gymnastics notification test.',
      type: 'test',
      testId: /^[a-zA-Z0-9-]{1,64}$/.test(req.body?.testId || '') ? req.body.testId : '',
      url: '/parent/notifications'
    }, { endpoint });

    if (!result.attempted) {
      return res.status(404).json({ message: 'Enable notifications on this device first.', ...result });
    }

    if (!result.sent) {
      return res.status(502).json({
        message: result.deleted
          ? 'The old phone subscription was removed. Please enable notifications again.'
          : 'Unable to send a test notification right now.',
        ...result
      });
    }

    res.json({ ...result });
  } catch (error) {
    next(error);
  }
};

const saveNativePushToken = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const token = String(payload.token || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Android notification token is required.' });
    }

    const deviceId = String(payload.deviceId || '').trim();
    const sessionId = String(payload.sessionId || '').trim();
    const transportVersion = payload.transportVersion === 2 ? 2 : 1;
    if (token.length > 4096 || (transportVersion === 2
      && (!/^[a-zA-Z0-9-]{16,128}$/.test(deviceId) || !/^[a-f0-9]{64}$/.test(sessionId)))) {
      return res.status(400).json({ message: 'Invalid Android device registration.' });
    }
    await NativePushToken.findOneAndUpdate(
      { token },
      {
        userId: req.user._id,
        token,
        platform: 'android',
        deviceId: deviceId || undefined,
        sessionId: sessionId || undefined,
        transportVersion,
        appVersion: String(payload.appVersion || '').trim(),
        userAgent: req.get('user-agent') || '',
        updatedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (deviceId) await NativePushToken.deleteMany({ deviceId, token: { $ne: token } });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const deleteNativePushToken = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const token = String(payload.token || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Android notification token is required.' });
    }

    await NativePushToken.deleteOne({ userId: req.user._id, token });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getNativePushStatus = async (req, res, next) => {
  try {
    const token = String(req.query.token || '').trim();
    const filter = { userId: req.user._id, platform: 'android' };
    if (token) filter.token = token;
    const count = await NativePushToken.countDocuments(filter);
    res.json({ configured: isNativePushConfigured(), subscribed: count > 0 });
  } catch (error) {
    next(error);
  }
};

const sendNativeTestPushNotification = async (req, res, next) => {
  try {
    if (!isNativePushConfigured()) {
      return res.status(503).json({ message: 'Android push is not configured on the server.' });
    }

    const token = String(req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'Android notification token is required.' });
    }

    const result = await sendNativePushToUser(req.user._id, {
      title: 'Warriors Gymnastics',
      body: 'Android notifications are enabled for this phone.',
      type: 'test',
      url: '/parent/notifications'
    }, { token });

    if (!result.attempted) {
      return res.status(404).json({ message: 'Enable Android notifications on this phone first.', ...result });
    }

    if (!result.sent) {
      return res.status(502).json({
        message: result.deleted
          ? 'The old Android notification token was removed. Please enable notifications again.'
          : 'Unable to send an Android test notification right now.',
        ...result
      });
    }

    res.json({ ...result });
  } catch (error) {
    next(error);
  }
};

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
    const notification = await createAndPushNotification({
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
      await createNotifications(notifications);
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
      await createNotifications(notifications);
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
  getPushPublicKey,
  savePushSubscription,
  deletePushSubscription,
  getPushStatus,
  sendTestPushNotification,
  saveNativePushToken,
  deleteNativePushToken,
  getNativePushStatus,
  sendNativeTestPushNotification,
  getSavedMessages,
  createSavedMessage,
  updateSavedMessage,
  deleteSavedMessage,
  createNotification,
  announceAllParents,
  announceGroupParents
};

