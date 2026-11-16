const Notification = require('../models/Notification');
const NotificationResponse = require('../models/NotificationResponse');
const SavedNotificationMessage = require('../models/SavedNotificationMessage');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const PushSubscription = require('../models/PushSubscription');
const NativePushToken = require('../models/NativePushToken');
const { sanitizeObject, validateObjectId } = require('../middleware/validate');
const { createAuditLog } = require('../utils/audit');
const { getAppDayRangeUtc } = require('../utils/appDate');
const { getVapidPublicKey, isPushConfigured, sendPushToUser } = require('../utils/pushNotifications');
const { isNativePushConfigured, sendNativePushToUser } = require('../utils/nativePushNotifications');
const { createNotification: createAndPushNotification, createNotifications } = require('../utils/notificationDelivery');

const adminNotificationRoles = ['admin', 'coach', 'receptionist'];
const playerAudienceStatuses = ['active', 'frozen', 'expired', 'tryout', 'left'];
const parentReactionOptions = ['', '👍', '❤️', '🙏', '😊', '😮', '😢'];
const legacyAutomaticNotificationTypes = ['attendance', 'payment', 'test'];
const manualNotificationFilter = {
  $or: [
    { source: 'manual' },
    { source: { $exists: false }, type: { $nin: legacyAutomaticNotificationTypes } }
  ]
};
const isManualNotification = (notification) => (
  notification?.source === 'manual'
  || (!notification?.source && !legacyAutomaticNotificationTypes.includes(notification?.type))
);
const getPaginationOptions = (query) => {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 0, 0), 100);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { limit, page, skip: limit ? (page - 1) * limit : 0 };
};

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
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
        const { start, end } = getAppDayRangeUtc(req.query.date);
        filter.createdAt = { $gte: start, $lt: end };
      }
    }
    const { limit, page, skip } = getPaginationOptions(req.query);
    const query = Notification.find(filter).sort({ createdAt: -1 }).populate('recipientUserId', 'name email');
    if (limit) query.skip(skip).limit(limit);
    const [notifications, total] = await Promise.all([
      query,
      limit ? Notification.countDocuments(filter) : Promise.resolve(null)
    ]);
    if (limit) {
      return res.json({
        items: notifications,
        total,
        page,
        limit,
        hasMore: skip + notifications.length < total
      });
    }
    res.json(notifications);
  } catch (error) {
    next(error);
  }
};

const getManualPlayerNotificationHistory = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    if (!validateObjectId(playerId)) {
      return res.status(400).json({ message: 'Invalid player ID.' });
    }
    const player = await Player.findOne({ _id: playerId, isDeleted: { $ne: true } }).populate({
      path: 'parentId',
      populate: { path: 'userId', select: '_id name email' }
    });
    const recipient = player?.parentId?.userId;
    if (!player) return res.status(404).json({ message: 'Player not found.' });
    if (!recipient) return res.json({ player: { _id: player._id, fullName: player.fullName }, items: [], total: 0, page: 1, limit: 50, hasMore: false });

    const { limit: requestedLimit, page, skip: requestedSkip } = getPaginationOptions(req.query);
    const limit = requestedLimit || 50;
    const skip = requestedLimit ? requestedSkip : (page - 1) * limit;
    const filter = {
      $and: [
        manualNotificationFilter,
        { recipientUserId: recipient._id },
        {
          $or: [
            { playerId: player._id },
            { playerId: null },
            { playerId: { $exists: false } }
          ]
        }
      ]
    };
    const [items, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name email')
        .lean(),
      Notification.countDocuments(filter)
    ]);
    res.json({
      player: { _id: player._id, fullName: player.fullName, parentName: recipient.name },
      items,
      total,
      page,
      limit,
      hasMore: skip + items.length < total
    });
  } catch (error) {
    next(error);
  }
};

const getNotificationResponses = async (req, res, next) => {
  try {
    const filter = { $or: [{ reply: { $ne: '' } }, { reaction: { $ne: '' } }] };
    if (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))) {
      const { start, end } = getAppDayRangeUtc(req.query.date);
      filter.updatedAt = { $gte: start, $lt: end };
    }
    const { limit: requestedLimit, page, skip: requestedSkip } = getPaginationOptions(req.query);
    const limit = requestedLimit || 50;
    const skip = requestedLimit ? requestedSkip : (page - 1) * limit;
    const [items, total] = await Promise.all([
      NotificationResponse.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('recipientUserId', 'name email')
        .populate('playerId', 'fullName')
        .populate({ path: 'notificationId', select: 'title message type source createdAt recipientUserId playerId' })
        .lean(),
      NotificationResponse.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit, hasMore: skip + items.length < total });
  } catch (error) {
    next(error);
  }
};

const getUnviewedNotificationResponseCount = async (req, res, next) => {
  try {
    const count = await NotificationResponse.countDocuments({
      adminViewedAt: null,
      $or: [{ reply: { $ne: '' } }, { reaction: { $ne: '' } }]
    });
    res.json({ count });
  } catch (error) {
    next(error);
  }
};

const markNotificationResponsesViewed = async (req, res, next) => {
  try {
    const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
      .filter(validateObjectId)
      .map(String))].slice(0, 100);
    if (!ids.length) return res.json({ count: 0 });
    const result = await NotificationResponse.updateMany(
      { _id: { $in: ids }, adminViewedAt: null },
      { $set: { adminViewedAt: new Date() } }
    );
    res.json({ count: result.modifiedCount || 0 });
  } catch (error) {
    next(error);
  }
};

const saveParentNotificationResponse = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id)) return res.status(400).json({ message: 'Invalid notification ID.' });
    const notification = await Notification.findById(id).lean();
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    if (String(notification.recipientUserId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Forbidden.' });
    }
    if (!isManualNotification(notification)) {
      return res.status(400).json({ message: 'Replies are available for messages sent by the club.' });
    }

    const payload = sanitizeObject(req.body);
    const hasReply = Object.prototype.hasOwnProperty.call(payload || {}, 'reply');
    const hasReaction = Object.prototype.hasOwnProperty.call(payload || {}, 'reaction');
    if (!hasReply && !hasReaction) return res.status(400).json({ message: 'A reply or reaction is required.' });
    const existing = await NotificationResponse.findOne({ notificationId: notification._id });
    if (existing?.deletedAt) return res.status(409).json({ message: 'This response was deleted. Continue the conversation in Chat.' });
    const reply = hasReply ? String(payload.reply || '').trim() : String(existing?.reply || '');
    const reaction = hasReaction ? String(payload.reaction || '').trim() : String(existing?.reaction || '');
    if (reply.length > 2000) return res.status(400).json({ message: 'Reply is too long.' });
    if (!parentReactionOptions.includes(reaction)) return res.status(400).json({ message: 'Invalid reaction.' });

    if (!reply && !reaction) {
      if (existing) await NotificationResponse.deleteOne({ _id: existing._id, deletedAt: null });
      return res.json({ response: null });
    }
    const response = await NotificationResponse.findOneAndUpdate(
      { notificationId: notification._id, deletedAt: null },
      {
        $set: {
          recipientUserId: req.user._id,
          playerId: notification.playerId || undefined,
          reply,
          reaction,
          adminViewedAt: null,
          updatedAt: new Date()
        },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    ).catch((error) => {
      if (error.code === 11000) { error.statusCode = 409; error.message = 'This response changed. Refresh and continue in Chat.'; }
      throw error;
    });
    res.json({ response });
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
    const notification = await Notification.findById(id)
      .populate('recipientUserId', 'name email')
      .populate({ path: 'attachmentId', select: '+dataUrl kind mimeType fileName byteLength' });
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
    const response = notification.toObject();
    if (response.attachmentId?.dataUrl) {
      response.attachment = {
        kind: response.attachmentId.kind,
        dataUrl: response.attachmentId.dataUrl,
        mimeType: response.attachmentId.mimeType,
        fileName: response.attachmentId.fileName,
        byteLength: response.attachmentId.byteLength
      };
      response.attachmentId = response.attachmentId._id;
    }
    const parentResponse = await NotificationResponse.findOne({ notificationId: notification._id }).lean();
    response.response = parentResponse || null;
    response.canRespond = req.user.role === 'parent' && isManualNotification(response) && !parentResponse?.deletedAt;
    res.json(response);
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
    const { recipientUserId, playerId, title, message, type, attachment } = payload;
    if (!recipientUserId || !title || !message) {
      return res.status(400).json({ message: 'Recipient, title, and message are required.' });
    }
    const notification = await createAndPushNotification({
      recipientUserId,
      playerId,
      title,
      message,
      type
    }, { attachment, createdBy: req.user._id });
    await createAuditLog({ userId: req.user._id, action: 'create notification', entity: 'Notification', entityId: notification._id, req });
    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
};

const createPlayerNotification = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    const payload = sanitizeObject(req.body);
    const { title, message, type, attachment } = payload;
    if (!validateObjectId(playerId) || !title || !message) {
      return res.status(400).json({ message: 'Player, title, and message are required.' });
    }
    if (title.length > 160 || message.length > 2000) {
      return res.status(400).json({ message: 'The title or message is too long.' });
    }

    const player = await Player.findOne({ _id: playerId, isDeleted: { $ne: true } }).populate({
      path: 'parentId',
      populate: { path: 'userId', select: '_id role isActive' }
    });
    const recipient = player?.parentId?.userId;
    if (!player) {
      return res.status(404).json({ message: 'Player not found.' });
    }
    if (!recipient || recipient.role !== 'parent' || !recipient.isActive) {
      return res.status(400).json({ message: 'This player does not have an active parent account.' });
    }

    const notification = await createAndPushNotification({
      recipientUserId: recipient._id,
      playerId: player._id,
      title,
      message,
      type: type || 'announcement'
    }, { attachment, createdBy: req.user._id });
    await createAuditLog({
      userId: req.user._id,
      action: 'create player notification',
      entity: 'Notification',
      entityId: notification._id,
      req
    });
    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
};

const announceAllParents = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const { title, message, type, attachment } = payload;
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
      await createNotifications(notifications, { attachment, createdBy: req.user._id });
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
    const { groupId, title, message, type, attachment } = payload;
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
      await createNotifications(notifications, { attachment, createdBy: req.user._id });
    }
    await createAuditLog({ userId: req.user._id, action: 'announce group parents', entity: 'Notification', entityId: null, req });
    res.json({ count: notifications.length });
  } catch (error) {
    next(error);
  }
};

const announceParentsByPlayerStatus = async (req, res, next) => {
  try {
    const payload = sanitizeObject(req.body);
    const status = String(payload.status || '').trim().toLowerCase();
    const { title, message, type, attachment } = payload;
    if (!playerAudienceStatuses.includes(status) || !title || !message) {
      return res.status(400).json({ message: 'Valid player status, title, and message are required.' });
    }

    const players = await Player.find({
      isDeleted: { $ne: true },
      status
    }).populate({
      path: 'parentId',
      populate: { path: 'userId', select: 'isActive' }
    });

    const recipients = new Map();
    players.forEach((player) => {
      const user = player.parentId?.userId;
      if (user?.isActive) recipients.set(String(user._id), user._id);
    });
    const notifications = [...recipients.values()].map((recipientUserId) => ({
      recipientUserId,
      title,
      message,
      type: type || 'announcement',
      isRead: false
    }));

    if (notifications.length) await createNotifications(notifications, { attachment, createdBy: req.user._id });
    await createAuditLog({
      userId: req.user._id,
      action: `announce ${status} player parents`,
      entity: 'Notification',
      entityId: null,
      req
    });
    res.json({ count: notifications.length, status });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  getManualPlayerNotificationHistory,
  getNotificationResponses,
  getUnviewedNotificationResponseCount,
  markNotificationResponsesViewed,
  saveParentNotificationResponse,
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
  createPlayerNotification,
  announceAllParents,
  announceGroupParents,
  announceParentsByPlayerStatus
};

