const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('native registration stores authenticated owner and rotates only this device', async () => {
  const writes = [], deletes = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../controllers/notificationController.js'), 'utf8'), {
    module, require: (name) => {
      if (name === '../middleware/validate') return { sanitizeObject: (value) => value };
      if (name === '../models/NativePushToken') return {
        findOneAndUpdate: async (filter, value) => writes.push({ filter, value }),
        deleteMany: async (filter) => deletes.push(filter), deleteOne: async (filter) => deletes.push(filter)
      };
      return {};
    }
  });
  const body = { token: 'new-token', deviceId: 'device-1234567890', sessionId: 'a'.repeat(64), transportVersion: 2, userId: 'attacker-supplied-owner' };
  const req = { user: { _id: 'authenticated-parent' }, body, get: () => 'Android' };
  const res = { code: 200, status(code) { this.code = code; return this; }, send() {}, json() {} };
  await module.exports.saveNativePushToken(req, res, (error) => { throw error; });
  assert.equal(res.code, 204);
  assert.equal(writes[0].value.userId, 'authenticated-parent');
  assert.equal(writes[0].value.deviceId, body.deviceId);
  assert.equal(deletes[0].deviceId, body.deviceId);
  assert.equal(deletes[0].token.$ne, body.token);
  await module.exports.deleteNativePushToken(req, res, (error) => { throw error; });
  assert.equal(deletes[1].userId, 'authenticated-parent');
  req.body = { token: 'token', transportVersion: 2 };
  await module.exports.saveNativePushToken(req, res, (error) => { throw error; });
  assert.equal(res.code, 400);
  assert.equal(writes.length, 1);
});

test('one admin action persists once and independently fans out Web Push and FCM', async () => {
  const deliveries = [];
  let created = 0;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/notificationDelivery.js'), 'utf8'), {
    module, console: { error() {} }, require: (name) => {
      if (name === '../models/Notification') return { create: async (data) => { created++; return { ...data, _id: 'note-id' }; } };
      if (name === './pushNotifications') return { sendPushToUser: async (user, data) => { deliveries.push({ transport: 'web', user, data }); throw new Error('Web unavailable'); } };
      if (name === './nativePushNotifications') return { sendNativePushToUser: async (user, data) => deliveries.push({ transport: 'fcm', user, data }) };
      throw new Error(name);
    }
  });
  await module.exports.createNotification({ recipientUserId: 'parent', title: 'Message', message: 'Training time' });
  assert.equal(created, 1);
  assert.deepEqual(deliveries.map((item) => item.transport), ['web', 'fcm']);
  assert.equal(deliveries[0].data.notificationId, deliveries[1].data.notificationId);
});
