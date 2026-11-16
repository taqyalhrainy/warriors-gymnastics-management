const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const Group = require('../models/TrainingGroup');
const Attendance = require('../models/Attendance');
const Subscription = require('../models/Subscription');
const Payment = require('../models/Payment');
const History = require('../models/HistoryEntry');
const Notification = require('../models/Notification');
const NotificationResponse = require('../models/NotificationResponse');
const ChatMessage = require('../models/ChatMessage');
const { getAppDateKey, dateKeyToUtc, getAppDateTimeUtc } = require('../utils/appDate');

require('../utils/pushNotifications').sendPushToUser = async () => ({ attempted: 0, sent: 0 });
require('../utils/nativePushNotifications').sendNativePushToUser = async () => ({ attempted: 0, sent: 0 });
let mongo, server, origin, admin, parentUser, otherUser, parent, otherParent, group, adminToken, parentToken;
const token = (user) => jwt.sign({ id: String(user._id), sessionVersion: user.sessionVersion || 0 }, process.env.JWT_SECRET);
const call = async (path, { method = 'GET', body, auth = adminToken, status = 200 } = {}) => {
  const response = await fetch(origin + path, { method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  assert.equal(response.status, status, `${method} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
};
const newPlayer = async (overrides = {}) => Player.create({ fullName: 'Audit player', parentId: parent._id,
  parentPhoneEncrypted: 'test', groupId: group._id, groupIds: [group._id], packageClasses: 8,
  startDate: '2026-09-01', currentSubscriptionStartedAt: '2026-09-01', endDate: '2027-12-31', ...overrides });

before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await ChatMessage.init();
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  for (const route of ['auth', 'players', 'parents', 'groups', 'attendance', 'subscriptions', 'payments',
    'coaches', 'notifications', 'chat', 'programs', 'packageOptions', 'waitingList', 'history', 'reports', 'clubMedia', 'security', 'auditLogs']) {
    app.use('/' + route, require('../routes/' + route));
  }
  app.use(require('../middleware/errorHandler'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  [admin, parentUser, otherUser] = await User.create([
    { name: 'Audit admin', email: 'admin@audit.example', role: 'admin', passwordHash: 'test' },
    { name: 'Parent one', email: 'parent@audit.example', role: 'parent', passwordHash: 'test' },
    { name: 'Parent two', email: 'other@audit.example', role: 'parent', passwordHash: 'test' }
  ]);
  [parent, otherParent] = await Parent.create([{ name: parentUser.name, userId: parentUser._id }, { name: otherUser.name, userId: otherUser._id }]);
  group = await Group.create({ name: 'Audit group', days: ['Monday'], startTime: '17:00', endTime: '18:00', maxCapacity: 40 });
  adminToken = token(admin);
  parentToken = token(parentUser);
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('parent ownership applies to lists, arbitrary IDs, filters and group rosters', async () => {
  const own = await newPlayer();
  const foreign = await newPlayer({ fullName: 'Other child', parentId: otherParent._id });
  await Payment.create({ playerId: foreign._id, paidAmount: 50 });
  await Subscription.create({ playerId: foreign._id, type: 'sessions', startDate: '2026-09-01', endDate: '2027-01-01' });
  for (const path of [`/players/${foreign._id}`, `/attendance/player/${foreign._id}`, `/payments/player/${foreign._id}`]) {
    await call(path, { auth: parentToken, status: 404 });
  }
  assert.equal((await call(`/players?parentId=${otherParent._id}`, { auth: parentToken })).length, 0);
  assert.equal((await call('/players', { auth: parentToken }))[0]._id, String(own._id));
  assert.equal((await call('/payments', { auth: parentToken })).length, 0);
  assert.equal((await call(`/subscriptions?playerId=${foreign._id}`, { auth: parentToken })).length, 0);
  assert.equal((await call(`/groups/${group._id}/players`, { auth: parentToken })).length, 1);
  await Parent.deleteOne({ _id: parent._id });
  assert.equal((await call('/players', { auth: parentToken })).length, 0);
});

test('parent payment receipts keep their individual amounts instead of repeating the current subscription total', async () => {
  const child = await newPlayer({
    currentSubscriptionStartedAt: '2026-11-01',
    currentSubscriptionCreatedAt: '2026-11-01T09:00:00Z'
  });
  const rows = await Payment.create([
    { playerId: child._id, paidAmount: 80, transactionType: 'Partial payment', createdAt: '2026-11-02T10:00:00Z', paymentDate: '2026-11-02' },
    { playerId: child._id, paidAmount: 80, transactionType: 'Full payment', createdAt: '2026-11-10T10:00:00Z', paymentDate: '2026-11-10' },
    { playerId: child._id, paidAmount: 40, transactionType: 'Full payment', createdAt: '2026-10-02T10:00:00Z', paymentDate: '2026-10-02' }
  ]);
  const payments = await call('/parents/me/payments', { auth: parentToken });
  assert.equal(payments.length, 3);
  for (const receipt of payments) {
    const stored = rows.find((row) => String(row._id) === receipt._id);
    assert.equal(receipt.paidAmount, stored.paidAmount);
    assert.equal(receipt.visiblePaidAmount, stored.paidAmount);
    assert.equal(receipt.playerId.currentSubscriptionPaidAmount, 160);
  }
  const page = await call('/parents/me/payments?page=1&limit=1', { auth: parentToken });
  assert.equal(page.items[0].visiblePaidAmount, 80);
  assert.equal(page.items[0].playerId.currentSubscriptionPaidAmount, 160);
  await Payment.updateOne({ _id: rows[1]._id }, { $set: { isDeleted: true } });
  const fresh = await call('/parents/me/payments', { auth: parentToken });
  assert.equal(fresh.length, 2);
  assert.equal(fresh.find((row) => row._id === String(rows[0]._id)).visiblePaidAmount, 80);
  assert.equal(fresh[0].playerId.currentSubscriptionPaidAmount, 80);
  assert.equal((await Payment.findById(rows[0]._id)).paidAmount, 80);
});

test('inactive users lose existing sessions and parent mutations remain forbidden', async () => {
  await call('/players', { auth: null, status: 401 });
  await call('/players', { method: 'POST', auth: parentToken, body: {}, status: 403 });
  await User.updateOne({ _id: parentUser._id }, { $set: { isActive: false } });
  await call('/auth/me', { auth: parentToken, status: 401 });
});

test('manual player message history excludes automatic events and parents can reply or react only to their own manual messages', async () => {
  const child = await newPlayer({ fullName: 'Message child' });
  const foreignChild = await newPlayer({ fullName: 'Foreign message child', parentId: otherParent._id });
  const manual = await call(`/notifications/player/${child._id}`, {
    method: 'POST',
    body: { title: 'Manual reminder', message: 'Please bring the uniform.', type: 'announcement' },
    status: 201
  });
  await Notification.create({
    recipientUserId: parentUser._id,
    playerId: child._id,
    title: 'Attendance Registered',
    message: 'Automatic attendance event',
    type: 'attendance',
    source: 'system'
  });
  await Notification.create({
    recipientUserId: parentUser._id,
    title: 'Legacy manual note',
    message: 'Sent before source tracking existed.',
    type: 'announcement'
  });

  const history = await call(`/notifications/manual-history/${child._id}`);
  assert.equal(history.total, 2);
  assert.deepEqual(history.items.map((item) => item.title).sort(), ['Legacy manual note', 'Manual reminder']);
  const detail = await call(`/notifications/${manual._id}`, { auth: parentToken });
  assert.equal(detail.canRespond, true);

  const saved = await call(`/notifications/${manual._id}/response`, {
    method: 'PUT',
    auth: parentToken,
    body: { reply: 'Thank you, received.', reaction: '👍' }
  });
  assert.equal(saved.response.reply, 'Thank you, received.');
  assert.equal(saved.response.reaction, '👍');
  assert.equal(await NotificationResponse.countDocuments({ notificationId: manual._id }), 1);

  const otherParentToken = token(otherUser);
  await call(`/notifications/${manual._id}/response`, {
    method: 'PUT', auth: otherParentToken, body: { reaction: '❤️' }, status: 403
  });
  const foreignManual = await call(`/notifications/player/${foreignChild._id}`, {
    method: 'POST', body: { title: 'Other family', message: 'Private message' }, status: 201
  });
  assert.ok(foreignManual._id);

  const responseDay = getAppDateKey(new Date());
  const inbox = await call(`/notifications/responses?date=${responseDay}`);
  assert.equal(inbox.total, 1);
  assert.equal(inbox.items[0].notificationId.title, 'Manual reminder');
  assert.equal((await call('/notifications/responses/count')).count, 1);
  await call('/notifications/responses/mark-viewed', { method: 'POST', body: { ids: [inbox.items[0]._id] } });
  assert.equal((await call('/notifications/responses/count')).count, 0);
});

test('chat includes legacy notification replies and reactions with their original message on both sides', async () => {
  const note = await Notification.create({ recipientUserId: parentUser._id, title: 'Training reminder', message: 'Please bring your uniform.', type: 'announcement' });
  const response = await NotificationResponse.create({ notificationId: note._id, recipientUserId: parentUser._id, reply: 'We will be there.', reaction: '❤️' });
  for (const auth of [adminToken, parentToken]) {
    const chat = await call(`/chat/${parentUser._id}/messages`, { auth });
    assert.equal(chat.items.length, 1);
    assert.equal(chat.items[0].text, response.reply);
    assert.equal(chat.items[0].reaction, '❤️');
    assert.equal(chat.items[0].originalNotification.title, note.title);
  }
  assert.equal((await call('/chat/unread-count')).count, 1);
  const inbox = await call('/chat/conversations');
  assert.equal(inbox.items[0].name, parentUser.name);
  assert.equal(inbox.items[0].unreadCount, 1);
  await call(`/chat/${parentUser._id}/read`, { method: 'POST', body: { responses: [{ _id: response._id, updatedAt: response.updatedAt }] } });
  assert.equal((await call('/chat/unread-count')).count, 0);
});

test('parent and club chat is private, idempotent and does not add club replies to notifications', async () => {
  const url = `/chat/${parentUser._id}/messages`;
  const request = { method: 'POST', auth: parentToken, status: 201, body: { text: 'Can we change training time?', clientMessageId: crypto.randomUUID(), fromClub: true, senderUserId: admin._id } };
  const [one, retry] = await Promise.all([call(url, request), call(url, request)]);
  assert.equal(one._id, retry._id);
  assert.equal(one.fromClub, false);
  assert.equal(one.senderUserId, String(parentUser._id));
  assert.equal(await ChatMessage.countDocuments({}), 1);
  await call(url, { ...request, body: { ...request.body, text: 'Changed payload' }, status: 409 });
  const reply = await call(url, { method: 'POST', status: 201, body: { text: 'Of course, which day works for you?', clientMessageId: crypto.randomUUID() } });
  assert.equal(reply.fromClub, true);
  assert.equal(await Notification.countDocuments({}), 0);
  assert.equal((await call('/chat/unread-count', { auth: parentToken })).count, 1);
  const transcript = await call(url, { auth: parentToken });
  assert.equal(transcript.items.length, 2);
  await call(`/chat/${parentUser._id}/read`, { auth: parentToken, method: 'POST', body: { messageIds: [reply._id, one._id] } });
  assert.equal((await call('/chat/unread-count', { auth: parentToken })).count, 0);
  assert.equal((await ChatMessage.findById(one._id)).readAt, null, 'parents cannot mark their own messages as read by the club');
  assert.equal((await call('/chat/unread-count')).count, 1);
  const otherToken = token(otherUser);
  for (const method of ['GET', 'POST']) {
    await call(url, { auth: otherToken, method, body: method === 'POST' ? request.body : undefined, status: 403 });
  }
  await call(`/chat/${parentUser._id}/read`, { auth: otherToken, method: 'POST', body: { messageIds: [reply._id] }, status: 403 });
  assert.equal((await call('/chat/conversations', { auth: otherToken })).items.length, 0);
  await call(`/chat/${admin._id}/messages`, { status: 404 });
});

test('chat media persists atomically, stays private and never enters inbox or thread payloads', async () => {
  const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]);
  const attachment = { dataUrl: `data:audio/webm;base64,${bytes.toString('base64')}`, fileName: 'voice.webm' };
  const payload = { text: '', attachment, clientMessageId: crypto.randomUUID() };
  const path = `/chat/${parentUser._id}/messages`;
  const [one, retry] = await Promise.all([call(path, { method: 'POST', body: payload, auth: parentToken, status: 201 }), call(path, { method: 'POST', body: payload, auth: parentToken, status: 201 })]);
  assert.equal(one._id, retry._id);
  assert.equal(await ChatMessage.countDocuments(), 1);
  assert.equal(one.attachment.kind, 'audio');
  assert.equal(one.attachment.data, undefined);
  assert.equal(one.attachment.checksum, undefined);
  for (const route of [path, '/chat/conversations']) {
    const body = await call(route);
    assert.equal(body.items[0].attachment?.data || body.items[0].lastMessage?.attachment?.data, undefined);
    assert.doesNotMatch(JSON.stringify(body), /"checksum"|"data":|data:audio/);
  }
  const filePath = `${path}/${one._id}/attachment`;
  for (const auth of [adminToken, parentToken]) {
    const response = await fetch(origin + filePath, { headers: { Authorization: `Bearer ${auth}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/webm');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  assert.equal((await fetch(origin + filePath)).status, 401);
  await call(filePath, { auth: token(otherUser), status: 403 });
  await call(`/chat/${otherUser._id}/messages/${one._id}/attachment`, { auth: token(otherUser), status: 404 });
  await call(path, { method: 'POST', body: { ...payload, attachment: { ...attachment, dataUrl: 'data:audio/webm;base64,GkXfowAB' } }, auth: parentToken, status: 409 });
  await call(path, { method: 'POST', body: { ...payload, attachment: { ...attachment, dataUrl: attachment.dataUrl.replace('audio/webm', 'video/webm') } }, auth: parentToken, status: 409 });
  await call(path, { method: 'POST', body: { ...payload, clientMessageId: crypto.randomUUID(), attachment: { ...attachment, dataUrl: 'data:audio/webm;base64,PGh0bWw+' } }, status: 400 });
  assert.equal(await ChatMessage.countDocuments(), 1);
});

test('only the original sender can delete a chat message and retries never restore it', async () => {
  const url = `/chat/${parentUser._id}/messages`;
  const body = { text: 'Private original text', clientMessageId: crypto.randomUUID() };
  const sent = await call(url, { method: 'POST', body, auth: parentToken, status: 201 });
  const path = `${url}/${sent._id}`;
  await call(path, { method: 'DELETE', status: 403 });
  await call(path, { method: 'DELETE', auth: token(otherUser), status: 403 });
  const [deleted, repeated] = await Promise.all([call(path, { method: 'DELETE', auth: parentToken }), call(path, { method: 'DELETE', auth: parentToken })]);
  assert.ok(deleted.deletedAt);
  assert.equal(deleted.deletedAt, repeated.deletedAt);
  assert.equal(deleted.createdAt, sent.createdAt);
  assert.equal(deleted.text, 'This message was deleted.');
  assert.equal(await ChatMessage.countDocuments(), 1);
  const retriedSend = await call(url, { method: 'POST', body, auth: parentToken, status: 201 });
  assert.equal(retriedSend.deletedAt, deleted.deletedAt);
  assert.equal(retriedSend.text, 'This message was deleted.');
  for (const auth of [parentToken, adminToken]) {
    const thread = await call(url, { auth });
    assert.ok(thread.items[0].deletedAt);
    assert.doesNotMatch(JSON.stringify(thread), /Private original/);
  }
  assert.equal((await call('/chat/unread-count')).count, 0);
  const inbox = await call('/chat/conversations');
  assert.equal(inbox.items[0].lastMessage.deletedAt, deleted.deletedAt);
  assert.equal(inbox.items[0].unreadCount, 0);
  const otherStaff = await User.create({ name: 'Other admin', role: 'admin', email: 'other-staff@audit.example', passwordHash: 'test' });
  const club = await call(url, { method: 'POST', body: { text: 'Club reply', clientMessageId: crypto.randomUUID() }, status: 201 });
  await call(`${url}/${club._id}`, { method: 'DELETE', auth: token(otherStaff), status: 403 });
  await call(`${url}/${club._id}`, { method: 'DELETE', auth: parentToken, status: 403 });
  assert.ok((await call(`${url}/${club._id}`, { method: 'DELETE' })).deletedAt);
});

test('deleting chat media removes its bytes and propagates old-page tombstones without reloading history', async () => {
  const url = `/chat/${parentUser._id}/messages`;
  const sent = await call(url, { method: 'POST', status: 201, body: { clientMessageId: crypto.randomUUID(), attachment: { dataUrl: 'data:audio/ogg;base64,T2dnUzAwMDA=', fileName: 'voice.ogg' } } });
  await call(`${url}/${sent._id}`, { method: 'DELETE' });
  const raw = await ChatMessage.findById(sent._id).select('+attachment.data');
  assert.equal(raw.attachment, undefined);
  await call(`${url}/${sent._id}/attachment`, { auth: parentToken, status: 404 });
  const rows = await ChatMessage.insertMany(Array.from({ length: 45 }, (_, index) => ({ parentUserId: parentUser._id, senderUserId: admin._id, fromClub: true, text: `Old ${index}`, clientMessageId: crypto.randomUUID(), createdAt: new Date(Date.UTC(2026, 10, 15, 0, index)) })));
  await call(`${url}/${rows[0]._id}`, { method: 'DELETE' });
  const data = await call(`${url}?loadedSince=${rows[0].createdAt.toISOString()}`, { auth: parentToken });
  assert.equal(data.items.some((item) => item._id === String(rows[0]._id)), false);
  assert.ok(data.deleted.some((item) => item.key === `message-${rows[0]._id}`));
  await call(`${url}?loadedSince=invalid`, { status: 400 });
});

test('parents can delete notification replies from chat without deleting the original or reviving their response', async () => {
  const note = await Notification.create({ recipientUserId: parentUser._id, title: 'Club reminder', message: 'Original stays', type: 'announcement', source: 'manual' });
  const response = await NotificationResponse.create({ notificationId: note._id, recipientUserId: parentUser._id, reply: 'Private response', reaction: '👍' });
  const url = `/chat/${parentUser._id}/messages/${response._id}?kind=notification-response`;
  await call(url, { method: 'DELETE', status: 403 });
  const deleted = await call(url, { method: 'DELETE', auth: parentToken });
  assert.equal(deleted.createdAt, response.updatedAt.toISOString());
  assert.ok(deleted.deletedAt);
  assert.equal((await Notification.findById(note._id)).message, 'Original stays');
  assert.equal((await call('/chat/unread-count')).count, 0);
  const thread = await call(`/chat/${parentUser._id}/messages`);
  assert.equal(thread.items.length, 1);
  assert.equal(thread.items[0].reaction, '');
  assert.doesNotMatch(JSON.stringify(thread), /Private response/);
  const detail = await call(`/notifications/${note._id}`, { auth: parentToken });
  assert.equal(detail.canRespond, false);
  await call(`/notifications/${note._id}/response`, { method: 'PUT', auth: parentToken, body: { reply: 'Bring it back', reaction: '' }, status: 409 });
  await call(`/notifications/${note._id}/response`, { method: 'PUT', auth: parentToken, body: { reply: '', reaction: '' }, status: 409 });
  assert.equal(await NotificationResponse.countDocuments(), 1);
});

test('chat inbox pages contain ten unique accounts, search all pages and retain cross-source unread counts', async () => {
  const parents = await User.create(Array.from({ length: 25 }, (_, index) => ({
    name: `Conversation ${String(index).padStart(2, '0')}`, email: `chat-${index}@audit.example`, role: 'parent', passwordHash: 'test'
  })));
  const date = new Date('2026-11-15T10:00:00Z');
  await ChatMessage.insertMany(parents.map((person) => ({
    parentUserId: person._id, senderUserId: person._id, fromClub: false,
    text: 'Parent message', clientMessageId: crypto.randomUUID(), createdAt: date
  })));
  const note = await Notification.create({ recipientUserId: parents[24]._id, title: 'Reminder', message: 'Hello', type: 'announcement' });
  await NotificationResponse.create({ notificationId: note._id, recipientUserId: parents[24]._id, reaction: '👍', updatedAt: new Date('2026-11-15T11:00:00Z') });
  const first = await call('/chat/conversations');
  assert.equal(first.items.length, 10);
  assert.equal(first.items[0].name, 'Conversation 24');
  assert.equal(first.items[0].lastMessage.reaction, '👍');
  assert.equal(first.items[0].unreadCount, 2);
  assert.equal(first.hasMore, true);
  const nextUrl = (cursor) => `/chat/conversations?beforeAt=${encodeURIComponent(cursor.beforeAt)}&beforeId=${cursor.beforeId}`;
  const second = await call(nextUrl(first.cursor));
  const third = await call(nextUrl(second.cursor));
  assert.equal(second.items.length, 10);
  assert.equal(third.items.length, 5);
  assert.equal(third.hasMore, false);
  assert.equal(third.cursor, null);
  assert.equal(new Set([...first.items, ...second.items, ...third.items].map((item) => item._id)).size, 25);
  const searched = await call('/chat/conversations?search=Conversation%2000');
  assert.equal(searched.items.length, 1);
  assert.equal(searched.items[0].name, 'Conversation 00');
  assert.equal((await call('/chat/conversations?search=%2E%2A')).items.length, 0, 'search treats regular expression syntax as literal text');
  await call('/chat/conversations?beforeAt=invalid&beforeId=wrong', { status: 400 });
  const own = await call('/chat/conversations', { auth: token(parents[24]) });
  assert.equal(own.items.length, 1);
  assert.equal(own.items[0]._id, String(parents[24]._id));
  assert.equal(own.items[0].unreadCount, 0);
});

test('chat date filtering and cursor pagination preserve message order across pages', async () => {
  const date = '2026-11-15T12:00:00.000Z';
  await ChatMessage.insertMany(Array.from({ length: 45 }, (_, index) => ({ parentUserId: parentUser._id, senderUserId: parentUser._id, fromClub: false, text: `Message ${index}`, clientMessageId: crypto.randomUUID(), createdAt: date })));
  await ChatMessage.create({ parentUserId: otherUser._id, senderUserId: otherUser._id, fromClub: false, text: 'Private other chat', clientMessageId: crypto.randomUUID(), createdAt: date });
  const first = await call(`/chat/${parentUser._id}/messages?date=2026-11-15`, { auth: parentToken });
  assert.equal(first.items.length, 40);
  assert.equal(first.hasMore, true);
  const second = await call(`/chat/${parentUser._id}/messages?date=2026-11-15&beforeAt=${encodeURIComponent(first.cursor.beforeAt)}&beforeId=${first.cursor.beforeId}`, { auth: parentToken });
  assert.equal(second.items.length, 5);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.key)).size, 45);
  assert.equal((await call(`/chat/${parentUser._id}/messages?date=2026-11-16`)).items.length, 0);
  await call(`/chat/${parentUser._id}/messages?date=2026-02-30`, { status: 400 });
  await call(`/chat/${parentUser._id}/messages?beforeAt=invalid&beforeId=wrong`, { status: 400 });
  await call(`/chat/${parentUser._id}/messages`, { method: 'POST', body: { text: ' ', clientMessageId: crypto.randomUUID() }, status: 400 });
});

test('marking an older notification response read does not acknowledge a newer reaction', async () => {
  const note = await Notification.create({ recipientUserId: parentUser._id, title: 'Reminder', message: 'Hello', type: 'announcement' });
  const response = await NotificationResponse.create({ notificationId: note._id, recipientUserId: parentUser._id, reply: 'Hello back', updatedAt: '2026-11-14T10:00:00Z' });
  const older = response.updatedAt;
  await NotificationResponse.updateOne({ _id: response._id }, { $set: { reaction: '👍', updatedAt: new Date('2026-11-15T10:00:00Z') } });
  await call(`/chat/${parentUser._id}/read`, { method: 'POST', body: { responses: [{ _id: response._id, updatedAt: older }] } });
  assert.equal((await call('/chat/unread-count')).count, 1);
  assert.equal((await call(`/chat/${parentUser._id}/messages`)).items[0].reaction, '👍');
});

test('editing the current subscription start date moves the same cycle backward and recounts existing attendance', async () => {
  const child = await newPlayer({
    fullName: 'Moved cycle child',
    startDate: '2026-11-05',
    currentSubscriptionStartedAt: '2026-11-05',
    endDate: '2026-11-30',
    packageName: '8 classes',
    packageClasses: 8
  });
  const linked = await Subscription.create({
    playerId: child._id,
    type: 'sessions',
    packageName: '8 classes',
    totalSessions: 8,
    usedSessions: 1,
    remainingSessions: 7,
    startDate: '2026-11-05',
    endDate: '2026-11-30',
    status: 'active'
  });
  child.subscriptionId = linked._id;
  await child.save();
  const records = await Attendance.insertMany(['2026-10-22', '2026-10-29', '2026-11-05'].map((date) => ({
    playerId: child._id,
    groupId: group._id,
    markedBy: admin._id,
    status: 'present',
    date: `${date}T00:00:00Z`
  })));
  child.currentSubscriptionAttendanceIds = [records[2]._id];
  await child.save();

  const updated = await call(`/players/${child._id}`, {
    method: 'PUT',
    body: { startDate: '2026-10-22', endDate: '2026-11-16' }
  });
  assert.equal(updated.startDate.slice(0, 10), '2026-10-22');
  assert.equal(updated.currentSubscriptionStartedAt.slice(0, 10), '2026-10-22');
  assert.deepEqual(updated.currentSubscriptionAttendanceIds.map(String), [String(records[2]._id)]);

  const savedSubscription = await Subscription.findById(linked._id).lean();
  assert.equal(savedSubscription.startDate.toISOString().slice(0, 10), '2026-10-22');
  assert.equal(savedSubscription.endDate.toISOString().slice(0, 10), '2026-11-16');
  assert.equal(savedSubscription.usedSessions, 3);
  assert.equal(savedSubscription.remainingSessions, 5);

  const parentAttendance = await call('/parents/me/attendance', { auth: parentToken });
  const parentChild = parentAttendance.children.find((item) => item._id === String(child._id));
  assert.equal(parentChild.attendancePresentCount, 3);
  const history = await call(`/parents/me/attendance/${child._id}/history`, { auth: parentToken });
  assert.equal(history.subscriptionHistory.length, 1);
  assert.equal(history.subscriptionHistory[0].startDate.slice(0, 10), '2026-10-22');
});

test('admin skill levels persist, enter history, and only the owning parent can read them', async () => {
  const player = await newPlayer();
  const skillLevels = { beam: 'Level 3', vault: '8.5', floor: 'Working handspring', bars: 'Silver' };
  const saved = await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { skillLevels: { ...skillLevels, injected: 'ignored' } }
  });
  assert.deepEqual(saved.skillLevels, skillLevels);
  const stored = (await Player.findById(player._id)).skillLevels.toObject();
  assert.deepEqual(stored, skillLevels);
  const dashboard = await call('/parents/me/dashboard', { auth: parentToken });
  assert.deepEqual(dashboard.children[0].skillLevels, skillLevels);
  assert.deepEqual((await call('/parents/me/children', { auth: parentToken }))[0].skillLevels, skillLevels);
  assert.deepEqual((await History.findOne({ entityType: 'player', entityId: player._id }).sort({ createdAt: -1 })).after.skillLevels, skillLevels);
  await call(`/players/${player._id}`, { method: 'PUT', auth: parentToken, body: { skillLevels: { beam: 'Changed' } }, status: 403 });
  const foreign = await newPlayer({ fullName: 'Foreign levels', parentId: otherParent._id, skillLevels: { beam: 'Secret' } });
  const visibleIds = (await call('/parents/me/dashboard', { auth: parentToken })).children.map((child) => child._id);
  assert.ok(!visibleIds.includes(String(foreign._id)));
});

test('player custom subscription days persist, sanitize, and remain restorable in history', async () => {
  const player = await newPlayer();
  const saved = await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { subscriptionScheduleMode: 'custom', subscriptionCustomDays: [4, 2, 2, 9, -1] }
  });
  assert.equal(saved.subscriptionScheduleMode, 'custom');
  assert.deepEqual(saved.subscriptionCustomDays, [2, 4]);
  const history = await History.findOne({ entityType: 'player', entityId: player._id }).sort({ changedAt: -1 });
  assert.equal(history.after.subscriptionScheduleMode, 'custom');
  assert.deepEqual(history.after.subscriptionCustomDays, [2, 4]);

  const automatic = await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { subscriptionScheduleMode: 'auto', subscriptionCustomDays: [1, 3] }
  });
  assert.equal(automatic.subscriptionScheduleMode, 'auto');
  assert.deepEqual(automatic.subscriptionCustomDays, []);
});

test('invalid player saves do not alter parent membership or group counts', async () => {
  await call('/players', { method: 'POST', body: { fullName: 'Invalid', parentId: String(parent._id), parentPhone: '123',
    groupIds: [String(group._id)], packageClasses: -1 }, status: 400 });
  assert.equal((await Group.findById(group._id)).currentCount, 0);
  const player = await newPlayer();
  await Parent.updateOne({ _id: parent._id }, { $addToSet: { children: player._id } });
  await call(`/players/${player._id}`, { method: 'PUT', body: { parentId: String(otherParent._id), packageClasses: -1 }, status: 400 });
  assert.equal((await Parent.findById(otherParent._id)).children.length, 0);
  assert.equal((await Parent.findById(parent._id)).children.length, 1);
});

test('renewal, rollback and restart preserve the chosen cycle and manual attendance assignments', async () => {
  const player = await newPlayer({ startDate: '2026-08-01', currentSubscriptionStartedAt: '2026-08-01' });
  const sub = await Subscription.create({ playerId: player._id, type: 'sessions', totalSessions: 8,
    startDate: '2026-09-01', endDate: '2027-12-31' });
  player.subscriptionId = sub._id;
  const old = await Attendance.create({ playerId: player._id, groupId: group._id, date: '2026-07-20', status: 'present', markedBy: admin._id });
  player.currentSubscriptionAttendanceIds = [old._id];
  await player.save();
  await require('../controllers/playerController').reconcileLinkedSubscriptions();
  assert.equal((await Subscription.findById(sub._id)).startDate.toISOString().slice(0, 10), '2026-08-01');
  assert.equal((await Player.findById(player._id)).currentSubscriptionAttendanceIds.length, 1);
  await call(`/players/${player._id}`, { method: 'PUT', body: { newSubscription: true, startDate: '2026-09-14', endDate: '2027-12-31' } });
  await call(`/players/${player._id}`, { method: 'PUT', body: { startDate: '2026-08-01', currentSubscriptionStartedAt: '2026-08-01',
    currentSubscriptionAttendanceIds: [String(old._id)] } });
  assert.equal((await Subscription.findById(sub._id)).usedSessions, 1);
  assert.equal((await Subscription.findById(sub._id)).startDate.toISOString().slice(0, 10), '2026-08-01');
  assert.ok(await Attendance.findById(old._id));
});

test('a stale player edit cannot undo a later confirmed balance or subscription', async () => {
  const player = await newPlayer({ previousDueBalance: 70 });
  const version = player.__v;
  await call(`/players/${player._id}`, { method: 'PUT', body: { previousDueBalance: 0, expectedVersion: version } });
  await call(`/players/${player._id}`, { method: 'PUT', body: { previousDueBalance: 70, expectedVersion: version }, status: 409 });
  assert.equal((await Player.findById(player._id)).previousDueBalance, 0);
});

test('subscription edits recount existing attendance and cannot move ownership', async () => {
  const player = await newPlayer();
  const other = await newPlayer({ fullName: 'Another player' });
  const sub = await Subscription.create({ playerId: player._id, type: 'sessions', totalSessions: 8, usedSessions: 8,
    remainingSessions: 0, status: 'expired', startDate: '2026-09-01', endDate: '2027-12-31' });
  player.subscriptionId = sub._id;
  await player.save();
  await Attendance.create({ playerId: player._id, groupId: group._id, date: '2026-09-21', status: 'present', markedBy: admin._id });
  const saved = await call(`/subscriptions/${sub._id}`, { method: 'PUT', body: { startDate: '2026-09-20', playerId: String(other._id), usedSessions: 99 } });
  assert.equal(saved.usedSessions, 1);
  assert.equal(saved.remainingSessions, 7);
  assert.equal(saved.status, 'active');
  assert.equal(saved.playerId, String(player._id));
});

test('attendance history includes retained old classes and rejects invalid calendar dates', async () => {
  const player = await newPlayer();
  const old = new Date(); old.setUTCMonth(old.getUTCMonth() - 4);
  await Attendance.create({ playerId: player._id, groupId: group._id, date: old, status: 'present', markedBy: admin._id });
  assert.equal((await call(`/attendance/player/${player._id}`)).length, 1);
  await call('/attendance/today', { method: 'PUT', body: { playerId: String(player._id), groupId: String(group._id), status: 'present', date: '2026-02-30' }, status: 400 });
  assert.equal(await Attendance.countDocuments(), 1);
});

test('coach day notes survive attendance changes, reload, and stay on their own day', async () => {
  const coach = await call('/coaches', { method: 'POST', body: { name: 'Audit coach', phone: '123' }, status: 201 });
  const date = getAppDateKey();
  await call(`/coaches/${coach._id}/attendance`, { method: 'POST', body: { action: 'note', date, dayNote: 'Morning only' } });
  await call(`/coaches/${coach._id}/attendance`, { method: 'POST', body: { action: 'arrived', date } });
  assert.equal((await call('/coaches?date=' + date))[0].todayAttendance.dayNote, 'Morning only');
  const tomorrow = dateKeyToUtc(date); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  assert.equal((await call('/coaches?date=' + tomorrow.toISOString().slice(0, 10)))[0].todayAttendance, null);
  assert.equal((await call(`/coaches/${coach._id}`)).attendanceHistory[0].dayNote, 'Morning only');
});

test('repeated simultaneous attendance marks save one class and one parent notification', async () => {
  const player = await newPlayer();
  await Attendance.init();
  const body = { playerId: String(player._id), groupId: String(group._id), status: 'present' };
  const results = await Promise.all(Array.from({ length: 5 }, () => call('/attendance/today', { method: 'PUT', body })));
  assert.equal(new Set(results.map((row) => row._id)).size, 1);
  assert.equal(await Attendance.countDocuments({ playerId: player._id }), 1);
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 1);
  await call('/attendance/today', { method: 'PUT', body: { ...body, status: 'absent' } });
  assert.equal((await Attendance.findOne({ playerId: player._id })).status, 'absent');
  await call('/attendance/today', { method: 'DELETE', body });
  assert.equal(await Attendance.countDocuments({ playerId: player._id }), 0);
});

test('attendance writes return the authoritative package count and parent attendance exposes payment state', async () => {
  const todayKey = getAppDateKey();
  const cycleStart = dateKeyToUtc(todayKey);
  cycleStart.setUTCDate(cycleStart.getUTCDate() - 7);
  const player = await newPlayer({
    payment: 100,
    startDate: cycleStart,
    currentSubscriptionStartedAt: cycleStart
  });
  const subscription = await Subscription.create({
    playerId: player._id,
    type: 'sessions',
    totalSessions: 8,
    usedSessions: 3,
    remainingSessions: 5,
    startDate: cycleStart,
    endDate: '2027-12-31'
  });
  player.subscriptionId = subscription._id;
  await player.save();

  for (const offset of [3, 2, 1]) {
    const date = dateKeyToUtc(todayKey);
    date.setUTCDate(date.getUTCDate() - offset);
    await Attendance.create({ playerId: player._id, groupId: group._id, date, status: 'present', markedBy: admin._id });
  }

  const body = { playerId: String(player._id), groupId: String(group._id), status: 'present', date: todayKey };
  const first = await call('/attendance/today', { method: 'PUT', body });
  assert.equal(first.attendancePresentCount, 4);
  assert.equal(first.usedSessions, 4);
  assert.equal(first.remainingSessions, 4);

  const repeated = await call('/attendance/today', { method: 'PUT', body });
  assert.equal(repeated.attendancePresentCount, 4);
  assert.equal((await Subscription.findById(subscription._id)).usedSessions, 4);

  let parentAttendance = await call('/parents/me/attendance', { auth: parentToken });
  assert.equal(parentAttendance.children[0].currentSubscriptionPaidAmount, 0);
  await Payment.create({
    playerId: player._id,
    transactionType: 'Full payment',
    paidAmount: 100,
    totalAmount: 100,
    remainingAmount: 0,
    paymentDate: new Date()
  });
  parentAttendance = await call('/parents/me/attendance', { auth: parentToken });
  assert.equal(parentAttendance.children[0].currentSubscriptionPaidAmount, 100);
});

test('parent screens count a payment recorded before a future subscription start date', async () => {
  const futureStart = new Date();
  futureStart.setDate(futureStart.getDate() + 3);
  const player = await newPlayer({ payment: 100 });
  await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { newSubscription: true, startDate: getAppDateKey(futureStart), payment: 100 }
  });
  const cycle = await Player.findById(player._id);
  assert.ok(cycle.currentSubscriptionCreatedAt < cycle.currentSubscriptionStartedAt);

  await call('/payments', {
    method: 'POST',
    body: { playerId: String(player._id), paidAmount: 100, paymentMethod: 'Cash' },
    status: 201
  });

  const attendance = await call('/parents/me/attendance', { auth: parentToken });
  const dashboard = await call('/parents/me/dashboard', { auth: parentToken });
  const payments = await call('/parents/me/payments', { auth: parentToken });
  assert.equal(attendance.children[0].currentSubscriptionPaidAmount, 100);
  assert.equal(dashboard.children[0].currentSubscriptionPaidAmount, 100);
  assert.equal(payments[0].visiblePaidAmount, 100);
});

test('reports include unlinked subscriptions and count a manual balance only once', async () => {
  const player = await newPlayer({ payment: 100, previousDueBalance: 50, attendanceDueManual: true });
  await newPlayer({ fullName: 'Expired player', endDate: '2026-01-01' });
  await Payment.create([
    { playerId: player._id, paidAmount: 20, remainingAmount: 80, transactionType: 'Partial payment' },
    { playerId: player._id, paidAmount: 30, remainingAmount: 50, transactionType: 'Partial payment' }
  ]);
  const dashboard = await call('/reports/dashboard');
  assert.equal(dashboard.expiredSubscriptions, 1);
  assert.equal(dashboard.pendingAmounts, 50);
  const revenue = await call('/reports/revenue');
  assert.equal(revenue.totalPaid, 50);
  assert.equal(revenue.totalRemaining, 50);
});

test('freeze notes survive status changes and owner summary returns current payment and attendance in one response', async () => {
  const player = await newPlayer({ payment: 100, startDate: new Date(), currentSubscriptionStartedAt: new Date() });
  await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { status: 'frozen', note: 'Normal note', freezeNote: 'Medical freeze', showInAttendanceWhenFrozen: true }
  });
  const active = await call(`/players/${player._id}`, { method: 'PUT', body: { status: 'active' } });
  assert.equal(active.note, 'Normal note');
  assert.equal(active.freezeNote, 'Medical freeze');
  await call(`/players/${player._id}`, { method: 'PUT', body: { note: 'Still not a date audit event' } });
  await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { startDate: '2026-10-10', endDate: '2026-11-20' }
  });

  await Payment.create({
    playerId: player._id,
    transactionType: 'Full payment',
    paidAmount: 100,
    paymentDate: new Date()
  });
  await Attendance.create({
    playerId: player._id,
    groupId: group._id,
    date: dateKeyToUtc(getAppDateKey()),
    status: 'present',
    markedBy: admin._id
  });

  const summary = await call('/reports/owner-summary');
  const summaryPlayer = summary.players.find((item) => item._id === String(player._id));
  const summaryGroup = summary.board.find((item) => item._id === String(group._id));
  assert.equal(summaryPlayer.currentSubscriptionPaidAmount, 100);
  assert.equal(summaryGroup.presentCount, 1);
  assert.equal(summaryGroup.players[0].todayAttendance.status, 'present');
  assert.deepEqual(Object.keys(summaryGroup.players[0]).sort(), ['_id', 'fullName', 'parentId', 'todayAttendance']);
  const dateAuditLogs = await call('/reports/owner-date-audits');
  assert.equal(dateAuditLogs.length, 1);
  assert.equal(dateAuditLogs[0].playerName, player.fullName);
  assert.equal(dateAuditLogs[0].changedBy.name, admin.name);
  assert.deepEqual(dateAuditLogs[0].changes.map((change) => change.field), ['startDate', 'endDate']);
  assert.equal(dateAuditLogs[0].changes[0].after.slice(0, 10), '2026-10-10');
  assert.equal(dateAuditLogs[0].changes[1].before.slice(0, 10), '2027-12-31');
  assert.deepEqual(Object.keys(dateAuditLogs[0]).sort(), ['_id', 'changedAt', 'changedBy', 'changes', 'playerId', 'playerName']);
  await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { newSubscription: true, startDate: '2026-10-25', endDate: '2026-11-25' }
  });
  const auditsAfterNewSubscription = await call('/reports/owner-date-audits');
  assert.equal(auditsAfterNewSubscription.length, 1);
  assert.equal((await History.findOne({ entityId: player._id, source: 'new-subscription' })).source, 'new-subscription');
  await call('/reports/owner-summary', { auth: parentToken, status: 403 });
  await call('/reports/owner-date-audits', { auth: parentToken, status: 403 });
});

test('owner subscription totals use the cycle creation time and only subscription payments', async () => {
  const cycleCreatedAt = new Date('2026-10-14T08:00:00.000Z');
  const player = await newPlayer({
    fullName: 'Owner total player',
    payment: 100,
    startDate: '2026-11-01',
    currentSubscriptionStartedAt: '2026-11-01',
    currentSubscriptionCreatedAt: cycleCreatedAt
  });
  await Payment.create([
    {
      playerId: player._id,
      transactionType: 'Partial payment',
      paidAmount: 40,
      paymentDate: new Date('2026-09-01T09:00:00.000Z'),
      createdAt: new Date('2026-10-14T09:00:00.000Z')
    },
    {
      playerId: player._id,
      transactionType: 'Full payment',
      paidAmount: 10,
      createdAt: new Date('2026-10-14T10:00:00.000Z')
    },
    {
      playerId: player._id,
      transactionType: 'T-shirt',
      paidAmount: 25,
      createdAt: new Date('2026-10-14T11:00:00.000Z')
    },
    {
      playerId: player._id,
      transactionType: 'Partial payment',
      paidAmount: 30,
      createdAt: new Date('2026-10-13T11:00:00.000Z')
    }
  ]);

  const summary = await call('/reports/owner-summary');
  const row = summary.players.find((item) => item._id === String(player._id));
  assert.equal(row.currentSubscriptionCreatedAt, cycleCreatedAt.toISOString());
  assert.equal(row.currentSubscriptionExpectedAmount, 100);
  assert.equal(row.currentSubscriptionPaidAmount, 50);
  assert.equal(row.currentSubscriptionRemainingAmount, 50);
});

test('program and package changes persist without rewriting existing player packages', async () => {
  const player = await newPlayer();
  const program = await call('/programs', { method: 'POST', body: { name: 'Audit program', price: 100 }, status: 201 });
  await call(`/programs/${program._id}`, { method: 'PUT', body: { price: 0 } });
  assert.equal((await call('/programs'))[0].price, 0);
  const option = await call('/packageOptions', { method: 'POST', body: { name: 'Audit package', classes: 12, hours: 1 }, status: 201 });
  await call(`/packageOptions/${option._id}`, { method: 'PUT', body: { classes: 16 } });
  assert.equal((await call('/packageOptions'))[0].classes, 16);
  assert.equal((await Player.findById(player._id)).packageClasses, 8);
  await call(`/packageOptions/${option._id}`, { method: 'DELETE' });
  await call(`/programs/${program._id}`, { method: 'DELETE' });
});

test('player backup is an XLSX download and is forbidden to parents', async () => {
  await newPlayer();
  await call('/reports/players-backup', { auth: parentToken, status: 403 });
  const response = await fetch(origin + '/reports/players-backup', { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml/);
  const file = Buffer.from(await response.arrayBuffer());
  assert.equal(file.subarray(0, 2).toString(), 'PK');
  assert.ok(file.length > 1000);
});

test('deleted players disappear from all parent screens while attendance remains archived', async () => {
  const player = await newPlayer();
  await call(`/players/${player._id}`, { method: 'DELETE' });
  assert.equal((await call('/parents/me/children', { auth: parentToken })).length, 0);
  assert.equal((await call('/parents/me/attendance', { auth: parentToken })).children.length, 0);
  assert.equal((await call('/parents/me/dashboard', { auth: parentToken })).children.length, 0);
});

test('parent login names remain unique when edited', async () => {
  await call(`/parents/${otherParent._id}`, { method: 'PUT', body: { name: parent.name }, status: 409 });
  await call(`/parents/${otherParent._id}`, { method: 'PUT', body: { name: '  PARENT   ONE  ' }, status: 409 });
  assert.equal((await User.findById(otherUser._id)).name, 'Parent two');
});

test('notification read state and unread count belong only to the recipient', async () => {
  const notification = await call('/notifications', { method: 'POST', body: { recipientUserId: String(parentUser._id), title: 'Audit', message: 'Saved once', type: 'announcement' }, status: 201 });
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 1);
  await call(`/notifications/${notification._id}`, { auth: token(otherUser), status: 403 });
  await call(`/notifications/${notification._id}`, { auth: parentToken });
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 0);
});

test('direct player messages resolve the current parent on the server and target only that account', async () => {
  const player = await newPlayer({ fullName: 'Direct message child' });
  const notification = await call(`/notifications/player/${player._id}`, {
    method: 'POST',
    body: { title: 'Training update', message: 'Please check the schedule.', type: 'announcement' },
    status: 201
  });

  assert.equal(notification.playerId, String(player._id));
  assert.equal(notification.recipientUserId, String(parentUser._id));
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 1);
  assert.equal((await call('/notifications/count', { auth: token(otherUser) })).count, 0);
});

test('status announcements target each parent once and keep player audiences separate', async () => {
  await newPlayer({ fullName: 'Active one', status: 'active' });
  await newPlayer({ fullName: 'Active two', status: 'active' });
  await newPlayer({ fullName: 'Frozen other', parentId: otherParent._id, status: 'frozen' });

  const active = await call('/notifications/announce-status', {
    method: 'POST',
    body: { status: 'active', title: 'Active', message: 'Active message' }
  });
  assert.equal(active.count, 1);
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 1);
  assert.equal((await call('/notifications/count', { auth: token(otherUser) })).count, 0);

  const frozen = await call('/notifications/announce-status', {
    method: 'POST',
    body: { status: 'frozen', title: 'Frozen', message: 'Frozen message' }
  });
  assert.equal(frozen.count, 1);
  assert.equal((await call('/notifications/count', { auth: token(otherUser) })).count, 1);
  await call('/notifications/announce-status', {
    method: 'POST',
    body: { status: 'unknown', title: 'No', message: 'No' },
    status: 400
  });
});

test('waiting/data list edits, saved messages and gallery activation survive fresh reads', async () => {
  const row = await call('/waitingList', { method: 'POST', body: { playerName: 'Waiting student', parentName: 'Parent', desiredGroupIds: [String(group._id)] }, status: 201 });
  const directData = await call('/waitingList', { method: 'POST', body: { playerName: 'Direct data', listType: 'data' }, status: 201 });
  assert.equal(directData.listType, 'data');
  await call(`/waitingList/${row._id}`, { method: 'PUT', body: { playerName: 'Waiting student', listType: 'data', notes: 'Contacted' } });
  assert.ok((await call('/waitingList')).every((entry) => entry.listType === 'data'));
  const message = await call('/notifications/saved', { method: 'POST', body: { title: 'Template', message: 'Original' }, status: 201 });
  await call(`/notifications/saved/${message._id}`, { method: 'PUT', body: { title: 'Template', message: 'Edited' } });
  assert.equal((await call('/notifications/saved'))[0].message, 'Edited');
  const media = await call('/clubMedia', { method: 'POST', body: { type: 'image', mediaUrl: 'https://example.com/gym.png', title: 'Gym' }, status: 201 });
  assert.equal((await call('/clubMedia/public', { auth: null })).length, 1);
  await call(`/clubMedia/${media._id}`, { method: 'PUT', body: { isActive: false } });
  assert.equal((await call('/clubMedia/public', { auth: null })).length, 0);
});

test('payment day/month ranges follow Amman midnight and reject invalid dates', async () => {
  const player = await newPlayer();
  const records = await Payment.create(['2026-09-30T20:59:59Z', '2026-09-30T21:00:00Z',
    '2026-10-01T20:59:59Z', '2026-10-01T21:00:00Z'].map((paymentDate) => ({
    playerId: player._id, paidAmount: 30, paymentDate, transactionType: 'Full payment'
  })));
  const day = await call('/payments?day=2026-10-01');
  assert.deepEqual(day.map((row) => row._id).sort(), records.slice(1, 3).map((row) => String(row._id)).sort());
  assert.equal((await call('/payments?month=2026-09')).length, 1);
  assert.equal((await call('/payments?month=2026-10')).length, 3);
  await call('/payments?day=2026-02-30', { status: 400 });
  await call('/payments?month=2026-13', { status: 400 });
});

test('a saved receipt stays available after 25 later payments and search scans beyond page one', async () => {
  const saved = await call('/payments', { method: 'POST', body: { customPlayerName: 'Old saved receipt [A]',
    paidAmount: 110, paymentDate: '2026-10-08T00:00:00Z', paymentMethod: 'Cash' }, status: 201 });
  await Payment.create(Array.from({ length: 25 }, (_, i) => ({ playerNameSnapshot: `Later payer ${i}`,
    paidAmount: 20, paymentDate: '2026-10-08T12:00:00Z' })));
  const firstPage = await call('/payments?day=2026-10-08&limit=20');
  assert.equal(firstPage.total, 26);
  assert.equal(firstPage.totals.paid, 610);
  assert.ok(!firstPage.items.some((row) => row._id === saved._id));
  const daily = await call('/payments?day=2026-10-08');
  assert.equal(daily.length, 26);
  assert.ok(daily.some((row) => row._id === saved._id && row.paidAmount === 110));
  const searched = await call('/payments?search=' + encodeURIComponent('Old saved receipt [A]') + '&limit=20');
  assert.equal(searched.total, 1);
  assert.equal(searched.totals.paid, 110);
  assert.equal(searched.items[0]._id, saved._id);
  assert.deepEqual(await call('/payments?search=' + encodeURIComponent('Old saved receipt [A]'), { auth: parentToken }), []);
  assert.equal((await Payment.findById(saved._id)).paidAmount, 110);
});

test('payment deletion archives the original receipt while snapshot restore preserves newer receipts', async () => {
  const player = await newPlayer();
  const saved = await call('/payments', { method: 'POST', body: { playerId: String(player._id),
    paidAmount: 110, paymentMethod: 'Cash' }, status: 201 });
  const at = new Date();
  await new Promise((resolve) => setTimeout(resolve, 15));
  await call(`/payments/${saved._id}`, { method: 'DELETE' });
  const archived = await Payment.findById(saved._id);
  assert.equal(archived.paidAmount, 110);
  assert.equal(archived.isDeleted, true);
  assert.equal(String(archived.deletedBy), String(admin._id));
  assert.equal((await call('/payments')).length, 0);
  assert.equal((await call('/reports/revenue')).totalPaid, 0);
  assert.equal((await call('/parents/me/payments', { auth: parentToken })).length, 0);
  await call(`/payments/${saved._id}`, { method: 'PUT', body: { paidAmount: 90 }, status: 404 });
  const later = await call('/payments', { method: 'POST', body: { customPlayerName: 'Receipt after snapshot',
    paidAmount: 25, paymentMethod: 'Cash' }, status: 201 });
  const job = await call('/history/restore', { method: 'POST', body: { at: at.toISOString(), confirm: 'RESTORE', scopes: ['payments'] }, status: 202 });
  for (let i = 0; i < 100; i++) {
    const state = await call(`/history/restore/${job.jobId}`);
    if (state.status === 'failed') assert.fail(state.message);
    if (state.status === 'complete') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await Payment.findById(saved._id)).isDeleted, false);
  assert.equal((await Payment.findById(later._id)).isDeleted, false);
  assert.equal((await Payment.findById(later._id)).paidAmount, 25);
  assert.deepEqual((await call('/payments')).map((row) => row._id).sort(), [saved._id, later._id].sort());
  assert.equal((await call('/reports/revenue')).totalPaid, 135);
});

test('snapshot restores custom DSR payments that have no player link', async () => {
  const saved = await call('/payments', { method: 'POST', body: { customPlayerName: 'Walk-in', paidAmount: 25, paymentMethod: 'Cash', transactionType: 'DSR' }, status: 201 });
  const at = new Date();
  await new Promise((resolve) => setTimeout(resolve, 15));
  await call(`/payments/${saved._id}`, { method: 'PUT', body: { paidAmount: 50 } });
  const beforeRestore = new Date();
  await new Promise((resolve) => setTimeout(resolve, 15));
  const job = await call('/history/restore', { method: 'POST', body: { at: at.toISOString(), confirm: 'RESTORE', scopes: ['payments'] }, status: 202 });
  for (let i = 0; i < 100; i++) {
    const state = await call(`/history/restore/${job.jobId}`);
    if (state.status === 'failed') assert.fail(state.message);
    if (state.status === 'complete') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal((await Payment.findById(saved._id)).paidAmount, 25);
  const historical = await call(`/history?entityType=payment&at=${beforeRestore.toISOString()}`);
  assert.equal(historical.rows.find((row) => row._id === saved._id).paidAmount, 50);
});

test('price changes, renewals and payment edits never rewrite existing stored balances', async () => {
  const player = await newPlayer({ payment: 100, previousDueBalance: 70, attendanceDueManual: true });
  const old = await Payment.create({ playerId: player._id, paidAmount: 30, totalAmount: 100,
    remainingAmount: 70, transactionType: 'Partial payment' });
  const before = old.toObject();
  await call(`/players/${player._id}`, { method: 'PUT', body: { payment: 250 } });
  await call(`/players/${player._id}`, { method: 'PUT', body: { newSubscription: true, startDate: getAppDateKey() } });
  const added = await call('/payments', { method: 'POST', body: { playerId: String(player._id), paidAmount: 40,
    paymentMethod: 'Cash', transactionType: 'Partial payment' }, status: 201 });
  await call(`/payments/${added._id}`, { method: 'PUT', body: { paidAmount: 60 } });
  await call(`/payments/${added._id}`, { method: 'DELETE' });
  assert.deepEqual((await Payment.findById(old._id)).toObject(), before);
  assert.equal((await Player.findById(player._id)).previousDueBalance, 70);
});

test('owner subscription payment proof stays green after receipt deletion and resets only for a new cycle', async () => {
  const player = await newPlayer({ payment: 100 });
  await call(`/players/${player._id}`, {
    method: 'PUT',
    body: { newSubscription: true, startDate: getAppDateKey(), payment: 100 }
  });
  const openedCycle = await Player.findById(player._id);
  assert.ok(openedCycle.currentSubscriptionCreatedAt);
  assert.equal(openedCycle.currentSubscriptionPaymentConfirmedAt ?? null, null);

  const receipt = await call('/payments', {
    method: 'POST',
    body: { playerId: String(player._id), paidAmount: 100, paymentMethod: 'Cash' },
    status: 201
  });
  // The API acknowledges the durable receipt before optional proof bookkeeping.
  // Wait for that existing async contract instead of racing the background write.
  const proofDeadline = Date.now() + 5000;
  let paidCycle = await Player.findById(player._id);
  while (!paidCycle.currentSubscriptionPaymentConfirmedAt && Date.now() < proofDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    paidCycle = await Player.findById(player._id);
  }
  assert.ok(paidCycle.currentSubscriptionPaymentConfirmedAt);
  assert.equal(String(paidCycle.currentSubscriptionPaymentId), receipt._id);

  await call(`/payments/${receipt._id}`, { method: 'DELETE' });
  const afterDelete = await Player.findById(player._id);
  assert.ok(afterDelete.currentSubscriptionPaymentConfirmedAt);
  assert.equal(String(afterDelete.currentSubscriptionPaymentId), receipt._id);

  await call(`/players/${player._id}`, {
    method: 'PUT',
    body: {
      newSubscription: true,
      startDate: getAppDateKey(),
      currentSubscriptionPaymentConfirmedAt: new Date(),
      currentSubscriptionPaymentId: receipt._id
    }
  });
  const nextCycle = await Player.findById(player._id);
  assert.ok(nextCycle.currentSubscriptionCreatedAt);
  assert.equal(nextCycle.currentSubscriptionPaymentConfirmedAt ?? null, null);
  assert.equal(nextCycle.currentSubscriptionPaymentId ?? null, null);
});

test('owner summary repairs a same-day payment proof from an archived receipt', async () => {
  const player = await newPlayer({
    payment: 100,
    startDate: '2026-10-10',
    currentSubscriptionStartedAt: '2026-10-10',
    currentSubscriptionPaymentConfirmedAt: null
  });
  const receipt = await Payment.create({
    playerId: player._id,
    paidAmount: 100,
    transactionType: 'Full payment',
    createdAt: new Date('2026-10-10T09:00:00.000Z'),
    isDeleted: true
  });

  const rows = await call('/players?ownerSummary=true');
  const repaired = rows.find((row) => row._id === String(player._id));
  assert.ok(repaired.currentSubscriptionCreatedAt);
  assert.ok(repaired.currentSubscriptionPaymentConfirmedAt);
  assert.equal(String((await Player.findById(player._id)).currentSubscriptionPaymentId), String(receipt._id));
});

test('new players never acquire remaining automatically; manual amounts persist until manually replaced', async () => {
  const player = await newPlayer({ payment: 100 });
  assert.equal((await call('/reports/dashboard')).pendingAmounts, 0);
  const saved = await call('/payments', { method: 'POST', body: { playerId: String(player._id), paidAmount: 20,
    paymentMethod: 'Cash', transactionType: 'Partial payment' }, status: 201 });
  assert.equal(saved.remainingAmount, 0);
  assert.equal((await Payment.findById(saved._id)).remainingAmount, 0);
  await call(`/players/${player._id}`, { method: 'PUT', body: { payment: 250, newSubscription: true, startDate: getAppDateKey() } });
  assert.equal((await call('/payments'))[0].remainingAmount, 0);
  for (const amount of [70, 0, 35, 0]) {
    await call(`/players/${player._id}`, { method: 'PUT', body: { previousDueBalance: amount, dueAdjustment: 0 } });
    await call(`/payments/${saved._id}`, { method: 'PUT', body: { paidAmount: 500 } });
    await call(`/players/${player._id}`, { method: 'PUT', body: { payment: 999, note: 'Unrelated edit' } });
    assert.equal((await call('/payments'))[0].remainingAmount, amount);
    assert.equal((await call('/reports/dashboard')).pendingAmounts, amount);
    assert.equal((await call('/reports/revenue')).totalRemaining, amount);
    assert.equal((await call('/parents/me/payments', { auth: parentToken }))[0].visibleRemainingAmount, amount);
    assert.equal((await call(`/players/${player._id}`)).paymentRemainingAmount, amount);
  }
});

test('legacy automatic debt is ignored everywhere while manual attendance debt survives', async () => {
  const player = await newPlayer({ payment: 110, preservedRemainingBalance: 110 });
  const receipt = await Payment.create({ playerId: player._id, paidAmount: 110, totalAmount: 110,
    remainingAmount: 110, transactionType: 'Full payment' });
  const originalReceipt = receipt.toObject();
  const check = async (amount) => {
    assert.equal((await call('/payments')).find((row) => row._id === String(receipt._id)).remainingAmount, amount);
    assert.equal((await call('/reports/dashboard')).pendingAmounts, amount);
    assert.equal((await call('/reports/revenue')).totalRemaining, amount);
    assert.equal((await call('/parents/me/payments', { auth: parentToken }))[0].visibleRemainingAmount, amount);
    assert.equal((await call(`/players/${player._id}`)).paymentRemainingAmount, amount);
  };
  await check(0);
  assert.equal((await call(`/players/${player._id}`)).preservedRemainingBalance, 0);
  assert.equal((await call('/players?compact=true'))[0].preservedRemainingBalance, 0);
  assert.equal((await call('/payments'))[0].playerId.preservedRemainingBalance, 0);
  await call(`/players/${player._id}`, { method: 'PUT', body: { payment: 250, newSubscription: true, startDate: getAppDateKey() } });
  await check(0);
  assert.equal((await Player.findById(player._id)).preservedRemainingBalance, 110);
  await call(`/players/${player._id}`, { method: 'PUT', body: { previousDueBalance: 35, dueAdjustment: 0 } });
  await check(35);
  await call('/payments', { method: 'POST', body: { playerId: String(player._id), paidAmount: 250, paymentMethod: 'Cash' }, status: 201 });
  await check(35);
  await call(`/players/${player._id}`, { method: 'PUT', body: { previousDueBalance: 0, dueAdjustment: 0 } });
  await check(0);
  assert.deepEqual((await Payment.findById(receipt._id)).toObject(), originalReceipt);
});

test('editing an old coach day note preserves status, times and other days', async () => {
  const coach = await call('/coaches', { method: 'POST', body: { name: 'History coach' }, status: 201 });
  const path = `/coaches/${coach._id}/attendance`;
  const oldDate = '2026-09-20';
  const old = await call(path, { method: 'POST', body: { action: 'arrived', date: oldDate } });
  const corrected = await call(path, { method: 'POST', body: { action: 'arrival-time', date: oldDate, arrivalTime: '15:35' } });
  assert.equal(corrected.arrivedAt, getAppDateTimeUtc(oldDate, '15:35').toISOString());
  assert.equal(corrected.status, old.status);
  await call(path, { method: 'POST', body: { action: 'arrival-time', date: oldDate, arrivalTime: '25:00' }, status: 400 });
  await call(path, { method: 'POST', body: { action: 'note', date: '2026-09-21', dayNote: 'Other day' } });
  for (const note of ['Updated past day', '']) {
    await call(path, { method: 'POST', body: { action: 'note', date: old.date, dayNote: note } });
    const history = (await call(`/coaches/${coach._id}`)).attendanceHistory;
    const row = history.find((row) => row._id === old._id);
    assert.equal(row.dayNote, note);
    assert.equal(row.status, old.status);
    assert.equal(row.arrivedAt, corrected.arrivedAt);
    assert.equal(history.find((row) => row._id !== old._id).dayNote, 'Other day');
  }
  await call(path, { method: 'POST', auth: parentToken, body: { action: 'note', date: oldDate, dayNote: 'Forbidden' }, status: 403 });
  await call(path, { method: 'POST', auth: parentToken, body: { action: 'arrival-time', date: oldDate, arrivalTime: '16:00' }, status: 403 });
});

test('player note date changes only when the note text changes', async () => {
  const subject = await newPlayer();
  const first = await call(`/players/${subject._id}`, { method: 'PUT', body: { note: 'First note' } });
  assert.ok(first.noteUpdatedAt);
  const unchanged = await call(`/players/${subject._id}`, { method: 'PUT', body: { level: 'Beginner' } });
  assert.equal(unchanged.noteUpdatedAt, first.noteUpdatedAt);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const edited = await call(`/players/${subject._id}`, { method: 'PUT', body: { note: 'Edited note' } });
  assert.equal(edited.note, 'Edited note');
  assert.ok(new Date(edited.noteUpdatedAt) > new Date(first.noteUpdatedAt));
});

test('legacy player notes recover their last edit time from history without changing stored data', async () => {
  const subject = await newPlayer();
  const changedAt = new Date('2026-10-20T16:45:00.000Z');
  await Player.updateOne({ _id: subject._id }, {
    $set: { note: 'Legacy note' },
    $unset: { noteUpdatedAt: 1 }
  });
  await History.create({
    entityType: 'player',
    entityId: subject._id,
    action: 'update',
    before: { note: 'Earlier note' },
    after: { note: 'Legacy note' },
    changedFields: ['note'],
    changedAt
  });

  const detail = await call(`/players/${subject._id}`);
  assert.equal(detail.noteUpdatedAt, changedAt.toISOString());
  const board = await call('/groups/attendance-board');
  assert.equal(board.players.find((player) => player._id === String(subject._id)).noteUpdatedAt, changedAt.toISOString());
  assert.equal((await Player.findById(subject._id)).noteUpdatedAt, undefined);
});
