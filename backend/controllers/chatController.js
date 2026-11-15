const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');
const NotificationResponse = require('../models/NotificationResponse');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { validateObjectId } = require('../middleware/validate');
const { getAppDayRangeUtc, getAppDateTimeUtc } = require('../utils/appDate');
const { pushNotification } = require('../utils/notificationDelivery');

const hasResponse = { $or: [{ reply: { $ne: '' } }, { reaction: { $ne: '' } }] };
const isClub = (req) => req.user.role !== 'parent';
const objectId = (id) => new mongoose.Types.ObjectId(String(id));

// Read existing notification responses directly so old replies remain available
// without copying or rewriting any existing messages.
const transcriptPipeline = (parentUserId) => {
  const filter = parentUserId ? { parentUserId: objectId(parentUserId) } : {};
  const responseFilter = parentUserId ? { recipientUserId: objectId(parentUserId) } : {};
  return [
    { $match: filter },
    { $project: { parentUserId: 1, senderUserId: 1, fromClub: 1, text: 1, readAt: 1, createdAt: 1, kind: { $literal: 'message' } } },
    { $unionWith: {
      coll: NotificationResponse.collection.name,
      pipeline: [
        { $match: { ...responseFilter, ...hasResponse } },
        { $project: {
          parentUserId: '$recipientUserId', senderUserId: '$recipientUserId', fromClub: { $literal: false },
          text: '$reply', reaction: 1, notificationId: 1, playerId: 1,
          readAt: { $ifNull: ['$adminViewedAt', null] },
          createdAt: { $ifNull: ['$updatedAt', '$createdAt'] }, kind: { $literal: 'notification-response' }
        } }
      ]
    } }
  ];
};

const resolveParent = async (req, res) => {
  const parentUserId = req.params.parentUserId;
  if (!validateObjectId(parentUserId)) {
    res.status(400).json({ message: 'Invalid chat account.' });
    return null;
  }
  if (!isClub(req) && String(req.user._id) !== parentUserId) {
    res.status(403).json({ message: 'Forbidden.' });
    return null;
  }
  const parent = await User.findOne({ _id: parentUserId, role: 'parent', isActive: true }).select('_id name');
  if (!parent) res.status(404).json({ message: 'Chat account not found.' });
  return parent;
};

const getChatConversations = async (req, res, next) => {
  try {
    const items = await ChatMessage.aggregate([
      ...transcriptPipeline(isClub(req) ? null : req.user._id),
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: {
        _id: '$parentUserId', lastMessage: { $first: '$$ROOT' },
        unreadCount: { $sum: { $cond: [{ $and: [
          { $eq: ['$fromClub', !isClub(req)] },
          { $eq: [{ $ifNull: ['$readAt', null] }, null] }
        ] }, 1, 0] } }
      } },
      { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'parent' } },
      { $unwind: '$parent' },
      { $match: { 'parent.role': 'parent', 'parent.isActive': true } },
      { $project: { _id: 1, lastMessage: 1, unreadCount: 1, name: '$parent.name' } },
      { $sort: { 'lastMessage.createdAt': -1, _id: -1 } }
    ]);
    res.json({ items });
  } catch (error) { next(error); }
};

const getChatUnreadCount = async (req, res, next) => {
  try {
    const parentFilter = isClub(req) ? {} : { parentUserId: req.user._id };
    const [messages, responses] = await Promise.all([
      ChatMessage.countDocuments({ ...parentFilter, fromClub: !isClub(req), readAt: null }),
      isClub(req) ? NotificationResponse.countDocuments({ ...hasResponse, adminViewedAt: null }) : 0
    ]);
    res.json({ count: messages + responses });
  } catch (error) { next(error); }
};

const getChatMessages = async (req, res, next) => {
  try {
    const parent = await resolveParent(req, res);
    if (!parent) return;
    const pipeline = transcriptPipeline(parent._id);
    const limit = 40;
    if (req.query.date) {
      if (!getAppDateTimeUtc(String(req.query.date), '00:00')) return res.status(400).json({ message: 'Invalid chat date.' });
      const { start, end } = getAppDayRangeUtc(req.query.date);
      pipeline.push({ $match: { createdAt: { $gte: start, $lt: end } } });
    }
    if (req.query.beforeAt || req.query.beforeId) {
      const beforeAt = new Date(req.query.beforeAt);
      if (!validateObjectId(req.query.beforeId) || Number.isNaN(beforeAt.getTime())) {
        return res.status(400).json({ message: 'Invalid message cursor.' });
      }
      pipeline.push({ $match: { $or: [
        { createdAt: { $lt: beforeAt } },
        { createdAt: beforeAt, _id: { $lt: objectId(req.query.beforeId) } }
      ] } });
    }
    pipeline.push({ $sort: { createdAt: -1, _id: -1 } }, { $limit: limit + 1 });
    const rows = await ChatMessage.aggregate(pipeline);
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const notifications = await Notification.find({ _id: { $in: items.map((item) => item.notificationId).filter(Boolean) }, recipientUserId: parent._id })
      .select('_id title message attachmentId').lean();
    const originals = new Map(notifications.map((item) => [String(item._id), item]));
    const oldest = items.at(-1);
    res.json({
      parent,
      items: items.reverse().map((item) => ({
        ...item, key: `${item.kind}-${item._id}`, originalNotification: originals.get(String(item.notificationId)) || null
      })),
      hasMore,
      cursor: hasMore && oldest ? { beforeAt: oldest.createdAt, beforeId: oldest._id } : null
    });
  } catch (error) { next(error); }
};

const sendChatMessage = async (req, res, next) => {
  try {
    const parent = await resolveParent(req, res);
    if (!parent) return;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
    const clientMessageId = req.body?.clientMessageId;
    if (!text || text.length > 2000 || typeof clientMessageId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientMessageId)) {
      return res.status(400).json({ message: 'Enter a message of 1–2000 characters with a valid message ID.' });
    }
    const key = { parentUserId: parent._id, senderUserId: req.user._id, clientMessageId };
    let message;
    let created = false;
    try {
      message = await ChatMessage.create({ ...key, text, fromClub: isClub(req) });
      created = true;
    } catch (error) {
      if (error.code !== 11000) throw error;
      message = await ChatMessage.findOne(key);
      if (!message || message.text !== text) return res.status(409).json({ message: 'Message ID already used. Refresh before sending again.' });
    }
    res.status(201).json({ ...message.toObject(), key: `message-${message._id}`, kind: 'message' });
    if (created && isClub(req)) {
      // Persist the chat message first. Phone delivery never adds a notification
      // record or delays the acknowledgement of a saved chat message.
      pushNotification({
        _id: message._id, recipientUserId: parent._id, title: 'Warriors Gymnastics',
        message: text, type: 'chat', url: '/parent/chat'
      }).catch((error) => console.error('Chat push delivery failed:', error.message));
    }
  } catch (error) { next(error); }
};

const markChatRead = async (req, res, next) => {
  try {
    const parent = await resolveParent(req, res);
    if (!parent) return;
    const ids = (Array.isArray(req.body?.messageIds) ? req.body.messageIds : []).filter(validateObjectId).slice(0, 100);
    const readAt = new Date();
    await ChatMessage.updateMany({ parentUserId: parent._id, _id: { $in: ids }, fromClub: !isClub(req), readAt: null }, { $set: { readAt } });
    if (isClub(req)) {
      const responses = (Array.isArray(req.body?.responses) ? req.body.responses : []).slice(0, 100)
        .filter((item) => validateObjectId(item?._id) && item.updatedAt && !Number.isNaN(new Date(item.updatedAt).getTime()));
      if (responses.length) await NotificationResponse.bulkWrite(responses.map((item) => ({ updateOne: {
        filter: { _id: item._id, recipientUserId: parent._id, adminViewedAt: null, updatedAt: new Date(item.updatedAt) },
        update: { $set: { adminViewedAt: readAt } }
      } })));
    }
    res.json({ readAt });
  } catch (error) { next(error); }
};

module.exports = { getChatConversations, getChatUnreadCount, getChatMessages, sendChatMessage, markChatRead };
