const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadModule = (file, dependencies) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module,
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: { env: { VAPID_PUBLIC_KEY: 'public', VAPID_PRIVATE_KEY: 'private' } },
    console: { error() {} },
    setTimeout: (callback) => { callback(); }
  });
  return module.exports;
};

const setup = (failureStatus, recover = false) => {
  const subscriptions = [
    { userId: 'parent', endpoint: 'https://fcm.googleapis.com/android' },
    { userId: 'parent', endpoint: 'https://web.push.apple.com/iphone' },
    { userId: 'other-parent', endpoint: 'https://fcm.googleapis.com/other' }
  ];
  const sent = [];
  const deleted = [];
  const matches = (subscription, filter) => Object.entries(filter)
    .every(([key, value]) => subscription[key] === value);
  const PushSubscription = {
    find: (filter) => ({ lean: async () => subscriptions.filter((item) => matches(item, filter)) }),
    deleteOne: async (filter) => deleted.push(filter)
  };
  const NativePushToken = {
    countDocuments: async () => 0,
    findOneAndUpdate: async () => null,
    deleteOne: async () => null
  };
  const push = loadModule('../utils/pushNotifications.js', {
    '../models/PushSubscription': PushSubscription,
    'web-push': {
      setVapidDetails() {},
      async sendNotification(subscription, payload, options) {
        sent.push({ endpoint: subscription.endpoint, options, payload: JSON.parse(payload) });
        if (subscription.endpoint.includes('/android') && failureStatus
          && (!recover || sent.filter((item) => item.endpoint === subscription.endpoint).length === 1)) {
          throw Object.assign(new Error('Provider rejected request'), { statusCode: failureStatus });
        }
      }
    }
  });
  const controller = loadModule('../controllers/notificationController.js', {
    '../models/Notification': {},
    '../models/SavedNotificationMessage': {},
    '../models/Parent': {},
    '../models/Player': {},
    '../models/PushSubscription': PushSubscription,
    '../models/NativePushToken': NativePushToken,
    '../middleware/validate': {},
    '../utils/audit': {},
    '../utils/notificationDelivery': {},
    '../utils/pushNotifications': push,
    '../utils/nativePushNotifications': {
      isNativePushConfigured: () => false,
      sendNativePushToUser: async () => ({ attempted: 0, sent: 0, deleted: 0, failed: 0 })
    }
  });
  const requestTest = async (endpoint, testId) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await controller.sendTestPushNotification(
      { user: { _id: 'parent' }, body: { endpoint, testId } }, response,
      (error) => { throw error; }
    );
    return response;
  };
  return { push, sent, deleted, requestTest };
};

test('Android test failure cannot be masked by a working iPhone', async () => {
  const { requestTest, sent, deleted } = setup(403);
  const response = await requestTest('https://fcm.googleapis.com/android');
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.sent, 0);
  assert.equal(response.body.failed, 1);
  assert.deepEqual(sent.map((item) => item.endpoint), ['https://fcm.googleapis.com/android']);
  assert.equal(deleted.length, 0);
});

test('tests require this device and cannot target another account', async () => {
  const { requestTest, sent } = setup();
  assert.equal((await requestTest()).statusCode, 400);
  assert.equal((await requestTest('https://fcm.googleapis.com/other')).statusCode, 404);
  assert.equal(sent.length, 0);
});

for (const statusCode of [400, 403, 429, 500]) {
  test(`provider ${statusCode} does not erase a phone subscription`, async () => {
    const { push, deleted } = setup(statusCode);
    const result = await push.sendPushToUser('parent', {}, { endpoint: 'https://fcm.googleapis.com/android' });
    assert.equal(result.failed, 1);
    assert.equal(deleted.length, 0);
  });
}

for (const statusCode of [404, 410]) {
  test(`expired subscription ${statusCode} is removed and reported for renewal`, async () => {
    const { requestTest, deleted } = setup(statusCode);
    const response = await requestTest('https://fcm.googleapis.com/android');
    assert.equal(response.body.deleted, 1);
    assert.equal(deleted[0].userId, 'parent');
    assert.equal(deleted[0].endpoint, 'https://fcm.googleapis.com/android');
  });
}

test('normal messages still reach both phones, with immediate delivery priority', async () => {
  const { push, sent } = setup();
  const result = await push.sendPushToUser('parent', { body: 'Training reminder' });
  assert.equal(result.sent, 2);
  assert.equal(sent.length, 2);
  assert.ok(sent.every((item) => item.options.urgency === 'high'));
});

test('temporary Android provider failure is retried without dropping the message', async () => {
  const { push, sent, deleted } = setup(503, true);
  const result = await push.sendPushToUser('parent', { body: 'Training reminder' }, { endpoint: 'https://fcm.googleapis.com/android' });
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(sent.length, 2);
  assert.equal(deleted.length, 0);
  assert.deepEqual(sent[0].payload, sent[1].payload);
});

test('test correlation reaches only the requested phone unchanged', async () => {
  const { requestTest, sent } = setup();
  await requestTest('https://fcm.googleapis.com/android', 'test-123');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.testId, 'test-123');
});
