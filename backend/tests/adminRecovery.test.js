const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Attempt = require('../models/RecoveryAttempt');
const { matchesSecret } = require('../controllers/adminRecoveryController');
const secret = crypto.randomBytes(24).toString('hex');
const password = 'OriginalPassword123';
const nextPassword = 'ReplacementPassword456';
let mongo, server, base, admin, parent, adminToken, parentToken;
const request = async (path, body, auth) => {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() };
};
const resetBody = (username, recoverySecret = secret) => ({ username, recoverySecret, newPassword: nextPassword, confirmPassword: nextPassword });
before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.ADMIN_RECOVERY_SECRET_HASH = crypto.createHash('sha256').update(secret).digest('hex');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Attempt.init()]);
  const passwordHash = await bcrypt.hash(password, 12);
  admin = await User.create({ name: 'Admin', email: 'admin@test.example', passwordHash, role: 'admin' });
  parent = await User.create({ name: 'Parent', email: 'parent@test.example', passwordHash, role: 'parent' });
  adminToken = jwt.sign({ id: String(admin._id) }, process.env.JWT_SECRET);
  parentToken = jwt.sign({ id: String(parent._id) }, process.env.JWT_SECRET);
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../routes/auth'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/auth`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('hash verification is exact and fails closed for missing or malformed configuration', () => {
  assert.equal(matchesSecret(secret), true);
  assert.equal(matchesSecret(secret + ' '), false);
  assert.equal(matchesSecret({}), false);
  const saved = process.env.ADMIN_RECOVERY_SECRET_HASH;
  delete process.env.ADMIN_RECOVERY_SECRET_HASH;
  assert.equal(matchesSecret(''), false);
  process.env.ADMIN_RECOVERY_SECRET_HASH = 'bad';
  assert.equal(matchesSecret(secret), false);
  process.env.ADMIN_RECOVERY_SECRET_HASH = saved;
});

test('recovery is admin-only and does not distinguish unknown, inactive or wrong-secret accounts', async () => {
  const first = await request('/admin/reset-password', resetBody(admin.email, 'wrong'));
  for (const username of [parent.email, 'missing@test.example']) {
    const result = await request('/admin/reset-password', resetBody(username));
    assert.equal(result.status, 400);
    assert.deepEqual(result.data, first.data);
  }
  await User.updateOne({ _id: admin._id }, { $set: { isActive: false } });
  assert.deepEqual((await request('/admin/reset-password', resetBody(admin.email))).data, first.data);
  await User.updateOne({ _id: admin._id }, { $set: { isActive: true } });
  assert.equal(await bcrypt.compare(password, (await User.findById(admin._id)).passwordHash), true);
});

test('fixed secret remains reusable, successful resets do not count as failures, sessions are revoked', async () => {
  await Attempt.deleteMany({});
  for (let i = 0; i < 6; i++) {
    const result = await request('/admin/reset-password', resetBody(admin.email));
    assert.equal(result.status, 200);
    assert.equal(result.cache, 'no-store');
    assert.deepEqual(Object.keys(result.data), ['message']);
  }
  assert.equal((await request('/me', null, adminToken)).status, 401);
  assert.equal((await request('/me', null, parentToken)).status, 200);
  const user = await User.findById(admin._id);
  assert.equal(await bcrypt.compare(nextPassword, user.passwordHash), true);
  assert.equal(JSON.stringify(user).includes(secret), false);
  const login = await request('/login', { email: admin.email, password: nextPassword });
  assert.equal(login.status, 200);
  adminToken = login.data.token;
  assert.equal((await request('/me', null, adminToken)).status, 200);
});

test('change password verifies current password and rejects non-admins', async () => {
  await Attempt.deleteMany({});
  const body = { currentPassword: 'wrong', newPassword: password, confirmPassword: password };
  assert.equal((await request('/admin/change-password', body, parentToken)).status, 403);
  assert.equal((await request('/admin/change-password', body, adminToken)).status, 400);
  body.currentPassword = nextPassword;
  assert.equal((await request('/admin/change-password', { ...body, confirmPassword: 'mismatch' }, adminToken)).status, 400);
  assert.equal((await request('/admin/change-password', body, adminToken)).status, 200);
  assert.equal((await request('/me', null, adminToken)).status, 401);
});

test('five failures persistently block recovery until the temporary window expires', async () => {
  await Attempt.deleteMany({});
  for (let i = 0; i < 5; i++) assert.equal((await request('/admin/reset-password', resetBody(admin.email, 'wrong'))).status, 400);
  assert.equal((await request('/admin/reset-password', resetBody(admin.email))).status, 429);
  assert.ok((await Attempt.findOne()).expiresAt > new Date());
  assert.equal(await bcrypt.compare(password, (await User.findById(admin._id)).passwordHash), true);
});
