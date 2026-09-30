const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const User = require('../models/User');
const Parent = require('../models/Parent');
const Player = require('../models/Player');
const Payment = require('../models/Payment');
const Group = require('../models/TrainingGroup');
const Attendance = require('../models/Attendance');
const Subscription = require('../models/Subscription');
const Program = require('../models/Program');
let releasePush;
const pendingPush = new Promise((resolve) => { releasePush = resolve; });
require('../utils/pushNotifications').sendPushToUser = () => pendingPush;
require('../utils/nativePushNotifications').sendNativePushToUser = () => pendingPush;
const payments = require('../controllers/paymentController');
const players = require('../controllers/playerController');
const groups = require('../controllers/groupController');
const attendance = require('../controllers/attendanceController');
const subscriptions = require('../controllers/subscriptionController');
const reports = require('../controllers/reportController');
let mongo, server, base, player, group;
const request = async (path, body) => {
  const response = await fetch(base + path, {
    method: body ? ((path.startsWith('/players/') || path.startsWith('/subscriptions/')) ? 'PUT' : 'POST') : 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
};
before(async () => {
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const admin = await User.create({ name: 'Test admin', email: 'admin@test.example', role: 'admin', passwordHash: 'test-only' });
  const parent = await Parent.create({ userId: admin._id, name: 'Test parent' });
  group = await Group.create({ name: 'Test', days: ['Monday'], startTime: '10:00', endTime: '11:00' });
  player = await Player.create({ fullName: 'Test player', parentId: parent._id, parentPhoneEncrypted: 'test', groupId: group._id, groupIds: [group._id], payment: 70, previousDueBalance: 70, attendanceDueManual: true });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = admin; next(); });
  app.post('/payments', payments.createPayment);
  app.get('/payments', payments.getPayments);
  app.put('/players/:id', players.updatePlayer);
  app.get('/players/:id', players.getPlayerById);
  app.get('/groups/:id', groups.getGroupPlayers);
  app.get('/attendance/:playerId', attendance.getAttendanceByPlayer);
  app.post('/attendance/today', attendance.updateTodayAttendance);
  app.post('/subscriptions', subscriptions.createSubscription);
  app.put('/subscriptions/:id', subscriptions.updateSubscription);
  app.get('/reports/dashboard', reports.getDashboardReport);
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  releasePush();
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('DSR payment is committed and reloadable while phone push delivery is still pending', { timeout: 10000 }, async () => {
  const saved = await request('/payments', { playerId: String(player._id), paidAmount: 20, paymentDate: '2026-09-22', paymentMethod: 'Cash' });
  assert.ok(await Payment.findById(saved._id));
  const reloaded = await request('/payments?day=2026-09-22&page=1&limit=20');
  assert.equal(reloaded.items.length, 1);
  assert.equal(reloaded.items[0]._id, saved._id);
  assert.equal(reloaded.items[0].paidAmount, 20);
  assert.equal(reloaded.items[0].playerId.attendanceDueManual, true);
  assert.equal(reloaded.items[0].remainingAmount, saved.remainingAmount);
});

test('attendance due 70 to zero, other amounts and credit persist across fresh reads and unrelated edits', async () => {
  for (const due of [0, 35, -10, 0]) {
    const saved = await request(`/players/${player._id}`, { previousDueBalance: due, dueAdjustment: 0 });
    assert.equal(saved.paymentRemainingAmount, due);
    await request(`/players/${player._id}`, { note: 'Unrelated edit' });
    const fresh = await request(`/players/${player._id}`);
    const board = await request(`/groups/${group._id}`);
    assert.equal(fresh.paymentRemainingAmount, due);
    assert.equal(fresh.previousDueBalance, due);
    assert.equal(board[0].paymentRemainingAmount, due);
    assert.equal((await Player.findById(player._id)).previousDueBalance, due);
  }
});

test('attendance confirmation does not wait for phone push providers', { timeout: 10000 }, async () => {
  const saved = await request('/attendance/today', { playerId: String(player._id), groupId: String(group._id), status: 'present' });
  assert.equal(saved.status, 'present');
  assert.ok(await Attendance.findById(saved._id));
  await Attendance.deleteOne({ _id: saved._id });
});

test('new subscriptions preserve attendance IDs, dates, marks and original groups', async () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  const record = await Attendance.create({ playerId: player._id, groupId: group._id, date,
    status: 'present', checkInTime: new Date(), markedBy: (await User.findOne())._id });
  const original = record.toObject();
  const nextGroup = await Group.create({ name: 'Next', days: ['Tuesday'], startTime: '11:00', endTime: '12:00' });
  for (const [offset, groupId] of [[0, group._id], [1, nextGroup._id]]) {
    const start = new Date(date);
    start.setDate(start.getDate() + offset);
    await request(`/players/${player._id}`, { newSubscription: true, startDate: start.toISOString(), groupIds: [String(groupId)] });
    assert.deepEqual((await Attendance.findById(record._id)).toObject(), original);
    const reloaded = await request(`/attendance/${player._id}`);
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0]._id, String(record._id));
    assert.equal(reloaded[0].status, 'present');
    assert.equal(reloaded[0].groupId, String(group._id));
  }
});

test('board reload and frontend recalculation agree on 3/8 after renewal', async () => {
  const { countAttendanceForCycle, packageCounter, isAttendanceSubscriptionExpired } = await import('../../frontend/src/utils/attendanceRecords.js');
  const renewed = await Player.create({ fullName: 'Renewed', parentId: player.parentId, parentPhoneEncrypted: 'test',
    groupId: group._id, groupIds: [group._id], startDate: '2026-08-01', currentSubscriptionStartedAt: '2026-09-20',
    endDate: '2026-10-20', packageClasses: 8 });
  const markedBy = (await User.findOne())._id;
  await Attendance.insertMany([1, 2, 3, 4, 5, 20, 21, 22].map((date) => ({
    playerId: renewed._id, groupId: group._id, markedBy, status: 'present', date: `2026-09-${String(date).padStart(2, '0')}T00:00:00Z`
  })));
  const board = (await request(`/groups/${group._id}`)).find((row) => row._id === String(renewed._id));
  const detail = await request(`/players/${renewed._id}`);
  const records = await Attendance.find({ playerId: renewed._id }).lean();
  const recalculated = { ...detail, attendancePresentCount: countAttendanceForCycle(records, detail) };
  assert.equal(board.attendancePresentCount, 3);
  assert.deepEqual(packageCounter(recalculated), packageCounter(board));
  assert.equal(isAttendanceSubscriptionExpired(recalculated, new Date('2026-09-29')), false);
});

test('a newer start date repairs a stale cycle marker even when the client omits newSubscription', async () => {
  const { attendanceCycleStart, countAttendanceForCycle, isAttendanceSubscriptionExpired } = await import('../../frontend/src/utils/attendanceRecords.js');
  const subject = await Player.create({ fullName: 'Stale cycle marker', parentId: player.parentId, parentPhoneEncrypted: 'test',
    groupId: group._id, groupIds: [group._id], startDate: '2026-07-20', currentSubscriptionStartedAt: '2026-07-20',
    endDate: '2026-08-20', packageClasses: 8 });
  const markedBy = (await User.findOne())._id;
  await Attendance.insertMany(['2026-07-20', '2026-08-03', '2026-08-10', '2026-09-14', '2026-09-21', '2026-09-24'].map((date) => ({
    playerId: subject._id, groupId: group._id, markedBy, status: 'present', date: `${date}T00:00:00Z`
  })));

  const updated = await request(`/players/${subject._id}`, { startDate: '2026-09-14', endDate: '2026-10-08' });
  const board = (await request(`/groups/${group._id}`)).find((row) => row._id === String(subject._id));
  const records = await Attendance.find({ playerId: subject._id }).lean();

  assert.equal(updated.currentSubscriptionStartedAt.slice(0, 10), '2026-09-14');
  assert.equal(new Date(attendanceCycleStart(updated)).toISOString().slice(0, 10), '2026-09-14');
  assert.equal(countAttendanceForCycle(records, updated), 3);
  assert.equal(board.attendancePresentCount, 3);
  assert.equal(isAttendanceSubscriptionExpired(board, new Date('2026-09-29')), false);
});

test('renewing a player also replaces stale linked subscription dates and counters', async () => {
  const subject = await Player.create({ fullName: 'Linked subscription player', parentId: player.parentId,
    parentPhoneEncrypted: 'test', groupId: group._id, groupIds: [group._id], packageName: 'Eight classes', packageClasses: 8, payment: 90 });
  const linked = await Subscription.create({ playerId: subject._id, type: 'sessions', packageName: 'Old', totalSessions: 12,
    usedSessions: 12, remainingSessions: 0, startDate: '2026-08-01', endDate: '2026-08-31', price: 70, status: 'expired' });
  subject.subscriptionId = linked._id;
  await subject.save();

  await request(`/players/${subject._id}`, {
    newSubscription: true,
    startDate: '2026-09-20',
    endDate: '2026-10-20'
  });

  const saved = await Subscription.findById(linked._id).lean();
  assert.equal(saved.packageName, 'Eight classes');
  assert.equal(saved.totalSessions, 8);
  assert.equal(saved.usedSessions, 0);
  assert.equal(saved.remainingSessions, 8);
  assert.equal(saved.startDate.toISOString().slice(0, 10), '2026-09-20');
  assert.equal(saved.endDate.toISOString().slice(0, 10), '2026-10-20');
  assert.equal(saved.price, 90);
  assert.equal(saved.status, 'active');
});

test('subscription screen keeps one current record and synchronizes the player in both directions', async () => {
  const subject = await Player.create({ fullName: 'Subscription screen player', parentId: player.parentId,
    parentPhoneEncrypted: 'test', groupId: group._id, groupIds: [group._id] });
  await Program.create({ name: 'Subscription test package', price: 110 });
  const payload = { playerId: String(subject._id), type: 'sessions', packageName: 'Subscription test package',
    totalSessions: 10, startDate: '2026-10-01', endDate: '2026-11-01', price: 110 };
  const first = await request('/subscriptions', payload);
  await request('/subscriptions', { ...payload, totalSessions: 8, startDate: '2026-10-05' });

  assert.equal(await Subscription.countDocuments({ playerId: subject._id }), 1);
  const syncedPlayer = await Player.findById(subject._id).lean();
  assert.equal(String(syncedPlayer.subscriptionId), first._id);
  assert.equal(syncedPlayer.packageClasses, 8);
  assert.equal(syncedPlayer.currentSubscriptionStartedAt.toISOString().slice(0, 10), '2026-10-05');

  const updated = await request(`/subscriptions/${first._id}`, { type: 'time', totalSessions: 0, endDate: '2027-01-01' });
  assert.equal(updated.status, 'active');
  assert.equal((await Player.findById(subject._id)).packageClasses, 0);
});

test('dashboard pending amount uses current-cycle player payments even without payment subscriptionId', async () => {
  const subject = await Player.create({ fullName: 'Dashboard payment player', parentId: player.parentId,
    parentPhoneEncrypted: 'test', groupId: group._id, groupIds: [group._id], payment: 100,
    startDate: '2026-09-01', currentSubscriptionStartedAt: '2026-09-01' });
  const linked = await Subscription.create({ playerId: subject._id, type: 'sessions', packageName: 'Dashboard',
    totalSessions: 8, remainingSessions: 8, startDate: '2026-09-01', endDate: '2027-01-01', price: 100, status: 'active' });
  subject.subscriptionId = linked._id;
  await subject.save();
  const before = await request('/reports/dashboard');
  const payment = await request('/payments', { playerId: String(subject._id), paidAmount: 40,
    paymentDate: '2026-09-29', paymentMethod: 'Cash' });
  assert.equal(payment.subscriptionId, undefined);
  const after = await request('/reports/dashboard');
  assert.equal(after.pendingAmounts, before.pendingAmounts - 40);
});
