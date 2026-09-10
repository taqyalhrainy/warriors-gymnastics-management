const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Attempt = require('../models/RecoveryAttempt');
const { generateCode, hash, normalizeCode } = require('../controllers/adminRecoveryController');
let mongo, server, base, admin, parent, adminToken, parentToken;
const password = 'OriginalPassword123';
const nextPassword = 'ReplacementPassword456';
const token = (user, version) => jwt.sign({ id: String(user._id), ...(version === undefined ? {} : { sessionVersion: version }) }, process.env.JWT_SECRET);
const request = async (path, body, auth) => {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {})
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() };
};
before(async () => {
  process.env.JWT_SECRET = 'test-only-recovery-session-secret';
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Attempt.init()]);
  const passwordHash = await bcrypt.hash(password, 12);
  admin = await User.create({ name: 'Admin', email: 'admin@test.example', passwordHash, role: 'admin' });
  parent = await User.create({ name: 'Parent', email: 'parent@test.example', passwordHash, role: 'parent' });
  adminToken = token(admin);
  parentToken = token(parent);
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

test('random codes have 160 bits of entropy and normalize pasted formatting', () => {
  const codes = Array.from({ length: 100 }, generateCode);
  assert.equal(new Set(codes).size, 100);
  assert.match(codes[0], /^[A-F0-9]{4}(?:-[A-F0-9]{4}){9}$/);
  assert.equal(normalizeCode(' abcd-1234 '), 'ABCD1234');
});

test('admin-only settings verify current password and never expose the saved hash', async () => {
  assert.equal((await request('/admin/recovery-code', { currentPassword: password })).status, 401);
  assert.equal((await request('/admin/recovery-code', { currentPassword: password }, parentToken)).status, 403);
  assert.equal((await request('/admin/recovery-code', { currentPassword: 'wrong' }, adminToken)).status, 400);
  const first = await request('/admin/recovery-code', { currentPassword: password }, adminToken);
  assert.equal(first.status, 200);
  assert.equal(first.cache, 'no-store');
  const stored = await User.findById(admin._id).select('+recoveryCodeHash');
  assert.equal(stored.recoveryCodeHash, hash(normalizeCode(first.data.recoveryCode)));
  assert.equal(JSON.stringify(stored).includes(first.data.recoveryCode), false);
  assert.equal((await request('/me', null, adminToken)).data.user.recoveryCodeHash, undefined);
  const second = await request('/admin/recovery-code', { currentPassword: password }, adminToken);
  assert.notEqual(second.data.recoveryCode, first.data.recoveryCode);
  assert.equal((await request('/admin/reset-password', { username: admin.email, recoveryCode: first.data.recoveryCode, newPassword: nextPassword, confirmPassword: nextPassword })).status, 400);
});

test('reset is atomic, rotates code, revokes legacy tokens and preserves other roles', async () => {
  await Attempt.deleteMany({});
  const generated = await request('/admin/recovery-code', { currentPassword: password }, adminToken);
  const body = { username: admin.email, recoveryCode: generated.data.recoveryCode, newPassword: nextPassword, confirmPassword: nextPassword };
  const results = await Promise.all([request('/admin/reset-password', body), request('/admin/reset-password', body)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
  assert.ok(results.find((r) => r.status === 200).data.recoveryCode);
  assert.equal((await request('/me', null, adminToken)).status, 401);
  assert.equal((await request('/me', null, parentToken)).status, 200);
  const updated = await User.findById(admin._id);
  assert.equal(await bcrypt.compare(nextPassword, updated.passwordHash), true);
  const login = await request('/login', { email: admin.email, password: nextPassword });
  assert.equal(login.status, 200);
  adminToken = login.data.token;
  assert.equal((await request('/me', null, adminToken)).status, 200);
});

test('change password rejects wrong current password/mismatch and revokes sessions', async () => {
  await Attempt.deleteMany({});
  const body = { currentPassword: 'wrong', newPassword: password, confirmPassword: password };
  assert.equal((await request('/admin/change-password', body, adminToken)).status, 400);
  body.currentPassword = nextPassword;
  body.confirmPassword = 'mismatch';
  assert.equal((await request('/admin/change-password', body, adminToken)).status, 400);
  body.confirmPassword = password;
  assert.equal((await request('/admin/change-password', body, adminToken)).status, 200);
  assert.equal((await request('/me', null, adminToken)).status, 401);
});

test('unknown and non-admin accounts get identical errors and persistent temporary blocks', async () => {
  await Attempt.deleteMany({});
  const code = generateCode();
  await User.updateOne({ _id: parent._id }, { $set: { recoveryCodeHash: hash(normalizeCode(code)) } });
  const body = { username: parent.email, recoveryCode: code, newPassword: password, confirmPassword: password };
  const existing = await request('/admin/reset-password', body);
  const missing = await request('/admin/reset-password', { ...body, username: 'missing@test.example' });
  assert.equal(existing.status, 400);
  assert.deepEqual(existing.data, missing.data);
  for (let i = 0; i < 4; i++) await request('/admin/reset-password', body);
  assert.equal((await request('/admin/reset-password', body)).status, 429);
  assert.ok((await Attempt.findOne()).expiresAt > new Date());
  assert.equal((await request('/me', null, parentToken)).status, 200);
});
