const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');

let mongo;
let server;
let origin;

const login = async (name, password) => {
  const response = await fetch(`${origin}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, password })
  });
  return { status: response.status, data: await response.json() };
};

test.before(async () => {
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  const app = express();
  app.use(express.json());
  app.use('/auth', require('../routes/auth'));
  app.use(require('../middleware/errorHandler'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.beforeEach(async () => {
  await User.deleteMany({});
});

test.after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('legacy parent login tolerates phone whitespace, invisible marks, and localized digits', async () => {
  const passwordHash = await bcrypt.hash('Parent123', 12);
  const user = await User.create({
    name: 'Retal\u00a0  Safi\u200f',
    email: 'retal@warriors.local',
    passwordHash,
    role: 'parent'
  });

  const result = await login('  RETAL SAFI  ', 'Parent١٢٣');
  assert.equal(result.status, 200);
  assert.equal(result.data.user.id, String(user._id));
  assert.equal((await User.findById(user._id)).loginNameKey, 'retal safi');
});

test('parent passwords remain case-sensitive after mobile normalization', async () => {
  await User.create({
    name: 'Case Parent',
    email: 'case@warriors.local',
    passwordHash: await bcrypt.hash('Parent123', 12),
    role: 'parent'
  });

  assert.equal((await login('Case Parent', 'parent١٢٣')).status, 401);
  assert.equal((await login('Case Parent', 'Parent١٢٣')).status, 200);
});

test('a legacy password saved with Arabic digits works from an English-digit phone', async () => {
  await User.create({
    name: 'Arabic Digit Parent',
    email: 'arabic-digits@warriors.local',
    passwordHash: await bcrypt.hash('Parent١٢٣', 12),
    role: 'parent'
  });

  assert.equal((await login('Arabic Digit Parent', 'Parent123')).status, 200);
});

test('ambiguous legacy normalized names never select the wrong parent account', async () => {
  const passwordHash = await bcrypt.hash('Parent123', 12);
  await User.create([
    { name: 'Same  Parent', email: 'same-one@warriors.local', passwordHash, role: 'parent' },
    { name: 'Same Parent', email: 'same-two@warriors.local', passwordHash, role: 'parent' }
  ]);

  assert.equal((await login('Same   Parent', 'Parent123')).status, 404);
});
