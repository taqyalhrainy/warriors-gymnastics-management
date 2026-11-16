const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');
const NotificationResponse = require('../models/NotificationResponse');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { validateObjectId } = require('../middleware/validate');
const { getAppDayRangeUtc, getAppDateTimeUtc } = require('../utils/appDate');
const { pushNotification } = require('../utils/notificationDelivery');
const { normalizeChatAttachment, publicChatMessage } = require('../utils/chatAttachments');

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
    { $unset: ['attachment.data', 'attachment.checksum'] },
    { $project: { parentUserId: 1, senderUserId: 1, fromClub: 1, text: 1, attachment: 1, readAt: 1, createdAt: 1, kind: { $literal: 'message' } } },
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
    const parentFilter = isClub(req) ? {} : { parentUserId: req.user._id };
    const responseFilter = isClub(req) ? {} : { recipientUserId: req.user._id };
    const unreadCount = { $sum: { $cond: [{ $and: [
      { $eq: ['$fromClub', !isClub(req)] },
      { $eq: [{ $ifNull: ['$readAt', null] }, null] }
    ] }, 1, 0] } };
    // Reduce each source to one row per account before merging the inbox.
    // The message sort uses the parent/date index instead of sorting every
    // message and reply together on each inbox refresh.
    const pipeline = [
      { $match: parentFilter },
      { $sort: { parentUserId: 1, createdAt: -1, _id: -1 } },
      { $unset: ['attachment.data', 'attachment.checksum'] },
      { $group: {
        _id: '$parentUserId', lastMessage: { $first: '$$ROOT' },
        unreadCount
      } },
      { $set: { 'lastMessage.kind': 'message' } },
      { $unionWith: {
        coll: NotificationResponse.collection.name,
        pipeline: [
          { $match: { ...responseFilter, ...hasResponse } },
          { $project: {
            parentUserId: '$recipientUserId', fromClub: { $literal: false }, text: '$reply', reaction: 1,
            createdAt: { $ifNull: ['$updatedAt', '$createdAt'] },
            readAt: { $ifNull: ['$adminViewedAt', null] }, kind: { $literal: 'notification-response' }
          } },
          { $sort: { parentUserId: 1, createdAt: -1, _id: -1 } },
          { $group: { _id: '$parentUserId', lastMessage: { $first: '$$ROOT' }, unreadCount } }
        ]
      } },
      { $sort: { 'lastMessage.createdAt': -1, 'lastMessage._id': -1 } },
      { $group: { _id: '$_id', lastMessage: { $first: '$lastMessage' }, unreadCount: { $sum: '$unreadCount' } } },
      { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'parent' } },
      { $unwind: '$parent' },
      { $match: { 'parent.role': 'parent', 'parent.isActive': true } }
    ];
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
    if (search) pipeline.push({ $match: { 'parent.name': { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } });
    if (req.query.beforeAt || req.query.beforeId) {
      const beforeAt = new Date(req.query.beforeAt);
      if (!validateObjectId(req.query.beforeId) || Number.isNaN(beforeAt.getTime())) {
        return res.status(400).json({ message: 'Invalid conversation cursor.' });
      }
      pipeline.push({ $match: { $or: [
        { 'lastMessage.createdAt': { $lt: beforeAt } },
        { 'lastMessage.createdAt': beforeAt, _id: { $lt: objectId(req.query.beforeId) } }
      ] } });
    }
    pipeline.push(
      { $sort: { 'lastMessage.createdAt': -1, _id: -1 } },
      { $limit: 11 },
      { $project: { _id: 1, unreadCount: 1, name: '$parent.name', lastMessage: {
        _id: '$lastMessage._id', createdAt: '$lastMessage.createdAt', text: '$lastMessage.text',
        reaction: '$lastMessage.reaction', attachment: '$lastMessage.attachment', fromClub: '$lastMessage.fromClub', kind: '$lastMessage.kind'
      } } }
    );
    const rows = await ChatMessage.aggregate(pipeline);
    const items = rows.slice(0, 10);
    const oldest = items.at(-1);
    res.json({ items, hasMore: rows.length > 10, cursor: rows.length > 10 && oldest
      ? { beforeAt: oldest.lastMessage.createdAt, beforeId: oldest._id } : null });
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
    const attachment = normalizeChatAttachment(req.body?.attachment);
    const clientMessageId = req.body?.clientMessageId;
    if ((!text && !attachment) || text.length > 2000 || typeof clientMessageId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientMessageId)) {
      return res.status(400).json({ message: 'Enter a message of 1–2000 characters with a valid message ID.' });
    }
    const key = { parentUserId: parent._id, senderUserId: req.user._id, clientMessageId };
    let message;
    let created = false;
    try {
      message = await ChatMessage.create({ ...key, text, attachment, fromClub: isClub(req) });
      created = true;
    } catch (error) {
      if (error.code !== 11000) throw error;
      message = await ChatMessage.findOne(key).select('+attachment.checksum');
      if (!message || message.text !== text || message.attachment?.checksum !== attachment?.checksum || message.attachment?.mimeType !== attachment?.mimeType) return res.status(409).json({ message: 'Message ID already used. Refresh before sending again.' });
    }
    res.status(201).json(publicChatMessage(message));
    if (created && isClub(req)) {
      // Persist the chat message first. Phone delivery never adds a notification
      // record or delays the acknowledgement of a saved chat message.
      pushNotification({
        _id: message._id, recipientUserId: parent._id, title: 'Warriors Gymnastics',
        message: text || ({ image: 'Photo', video: 'Video', audio: 'Voice message' }[attachment?.kind]), type: 'chat', url: '/parent/chat'
      }).catch((error) => console.error('Chat push delivery failed:', error.message));
    }
  } catch (error) { next(error); }
};

const getChatAttachment = async (req, res, next) => {
  try {
    const parent = await resolveParent(req, res);
    if (!parent) return;
    if (!validateObjectId(req.params.messageId)) return res.status(400).json({ message: 'Invalid message.' });
    const message = await ChatMessage.findOne({ _id: req.params.messageId, parentUserId: parent._id }).select('+attachment.data');
    if (!message?.attachment?.data) return res.status(404).json({ message: 'Attachment not found.' });
    res.set({ 'Content-Type': message.attachment.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(message.attachment.data);
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

module.exports = { getChatConversations, getChatUnreadCount, getChatMessages, sendChatMessage, markChatRead, getChatAttachment };
