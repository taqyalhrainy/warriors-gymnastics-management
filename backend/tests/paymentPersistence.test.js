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
let releasePush;
const pendingPush = new Promise((resolve) => { releasePush = resolve; });
require('../utils/pushNotifications').sendPushToUser = () => pendingPush;
require('../utils/nativePushNotifications').sendNativePushToUser = () => pendingPush;
const payments = require('../controllers/paymentController');
const players = require('../controllers/playerController');
const groups = require('../controllers/groupController');
const attendance = require('../controllers/attendanceController');
let mongo, server, base, player, group;
const request = async (path, body) => {
  const response = await fetch(base + path, {
    method: body ? (path.startsWith('/players/') ? 'PUT' : 'POST') : 'GET',
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
