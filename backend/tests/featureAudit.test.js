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
const { getAppDateKey, dateKeyToUtc } = require('../utils/appDate');

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
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  for (const route of ['auth', 'players', 'parents', 'groups', 'attendance', 'subscriptions', 'payments',
    'coaches', 'notifications', 'programs', 'packageOptions', 'waitingList', 'history', 'reports', 'clubMedia', 'security', 'auditLogs']) {
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

test('inactive users lose existing sessions and parent mutations remain forbidden', async () => {
  await call('/players', { auth: null, status: 401 });
  await call('/players', { method: 'POST', auth: parentToken, body: {}, status: 403 });
  await User.updateOne({ _id: parentUser._id }, { $set: { isActive: false } });
  await call('/auth/me', { auth: parentToken, status: 401 });
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
  assert.equal((await User.findById(otherUser._id)).name, 'Parent two');
});

test('notification read state and unread count belong only to the recipient', async () => {
  const notification = await call('/notifications', { method: 'POST', body: { recipientUserId: String(parentUser._id), title: 'Audit', message: 'Saved once', type: 'announcement' }, status: 201 });
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 1);
  await call(`/notifications/${notification._id}`, { auth: token(otherUser), status: 403 });
  await call(`/notifications/${notification._id}`, { auth: parentToken });
  assert.equal((await call('/notifications/count', { auth: parentToken })).count, 0);
});

test('waiting/data list edits, saved messages and gallery activation survive fresh reads', async () => {
  const row = await call('/waitingList', { method: 'POST', body: { playerName: 'Waiting student', parentName: 'Parent', desiredGroupIds: [String(group._id)] }, status: 201 });
  await call(`/waitingList/${row._id}`, { method: 'PUT', body: { playerName: 'Waiting student', listType: 'data', notes: 'Contacted' } });
  assert.equal((await call('/waitingList'))[0].listType, 'data');
  const message = await call('/notifications/saved', { method: 'POST', body: { title: 'Template', message: 'Original' }, status: 201 });
  await call(`/notifications/saved/${message._id}`, { method: 'PUT', body: { title: 'Template', message: 'Edited' } });
  assert.equal((await call('/notifications/saved'))[0].message, 'Edited');
  const media = await call('/clubMedia', { method: 'POST', body: { type: 'image', mediaUrl: 'https://example.com/gym.png', title: 'Gym' }, status: 201 });
  assert.equal((await call('/clubMedia/public', { auth: null })).length, 1);
  await call(`/clubMedia/${media._id}`, { method: 'PUT', body: { isActive: false } });
  assert.equal((await call('/clubMedia/public', { auth: null })).length, 0);
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

test('cutover preserves all existing finance balances without overwriting manual money or receipts', async () => {
  const { preserveLegacyRemainingBalances, getRemainingAmount } = require('../utils/manualRemaining');
  const old = await newPlayer({ payment: 100, previousDueBalance: 70, dueAdjustment: 10, attendanceDueManual: true });
  const untouchedNew = await newPlayer({ payment: 500 });
  await Player.collection.updateOne({ _id: old._id }, { $unset: { remainingBalancePolicyVersion: '', preservedRemainingBalance: '' } });
  const receipt = await Payment.create({ playerId: old._id, paidAmount: 30, totalAmount: 100,
    remainingAmount: 70, transactionType: 'Partial payment' });
  const originalReceipt = receipt.toObject();
  assert.equal(await preserveLegacyRemainingBalances(), 1);
  const preserved = await Player.findById(old._id);
  assert.equal(preserved.preservedRemainingBalance, 70);
  assert.equal(preserved.previousDueBalance, 70);
  assert.equal(preserved.dueAdjustment, 10);
  assert.equal(getRemainingAmount(preserved), 130);
  assert.equal(getRemainingAmount(await Player.findById(untouchedNew._id)), 0);
  assert.deepEqual((await Payment.findById(receipt._id)).toObject(), originalReceipt);
  await call(`/players/${old._id}`, { method: 'PUT', body: { payment: 400, newSubscription: true, startDate: getAppDateKey() } });
  await call('/payments', { method: 'POST', body: { playerId: String(old._id), paidAmount: 400, paymentMethod: 'Cash' }, status: 201 });
  assert.equal(await preserveLegacyRemainingBalances(), 0);
  assert.equal((await call('/reports/revenue')).totalRemaining, 130);
  await call(`/players/${old._id}`, { method: 'PUT', body: { previousDueBalance: 0, dueAdjustment: 0 } });
  assert.equal((await Player.findById(old._id)).preservedRemainingBalance, 0);
  assert.equal(await preserveLegacyRemainingBalances(), 0);
  assert.equal((await call('/reports/revenue')).totalRemaining, 0);
  assert.deepEqual((await Payment.findById(receipt._id)).toObject(), originalReceipt);
});
