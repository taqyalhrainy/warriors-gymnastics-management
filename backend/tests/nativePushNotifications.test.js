const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const loadModule = (file, dependencies, env = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
    module,
    Buffer,
    require: (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    process: {
      env: {
        FIREBASE_PROJECT_ID: 'project',
        FIREBASE_CLIENT_EMAIL: 'firebase@example.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----\\n',
        ...env
      }
    },
    console: { error() {} }
  });
  return module.exports;
};

const setup = (failure = null) => {
  const sent = [];
  const deleted = [];
  const tokens = [
    { userId: 'parent', token: 'android-token', platform: 'android' },
    { userId: 'other-parent', token: 'other-token', platform: 'android' }
  ];
  const NativePushToken = {
    find: (filter) => ({
      lean: async () => tokens.filter((item) => Object.entries(filter).every(([key, value]) => item[key] === value))
    }),
    deleteOne: async (filter) => deleted.push(filter)
  };
  const firebaseApp = {
    getApps: () => [],
    cert: (account) => account,
    initializeApp: () => ({ name: 'warriors-push' })
  };
  const firebaseMessaging = {
    getMessaging: () => ({
      send: async (message) => {
        sent.push(message);
        if (failure) throw Object.assign(new Error('FCM failed'), failure);
        return 'message-id';
      }
    })
  };
  const nativePush = loadModule('../utils/nativePushNotifications.js', {
    '../models/NativePushToken': NativePushToken,
    'firebase-admin/app': firebaseApp,
    'firebase-admin/messaging': firebaseMessaging
  });
  return { nativePush, sent, deleted };
};

test('native Android push sends only to this parent token with high priority', async () => {
  const { nativePush, sent } = setup();
  const result = await nativePush.sendNativePushToUser('parent', {
    title: 'Warriors',
    body: 'Training update',
    notificationId: 'note-1',
    url: '/parent/notifications/note-1'
  }, { token: 'android-token' });

  assert.equal(result.sent, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].token, 'android-token');
  assert.equal(sent[0].android.priority, 'high');
  assert.equal(sent[0].data.url, '/parent/notifications/note-1');
});

test('expired native Android token is removed without deleting other devices', async () => {
  const { nativePush, deleted } = setup({ code: 'messaging/registration-token-not-registered' });
  const result = await nativePush.sendNativePushToUser('parent', {}, { token: 'android-token' });

  assert.equal(result.deleted, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(deleted)), [{ userId: 'parent', token: 'android-token' }]);
});

test('temporary native Android provider errors do not delete the token', async () => {
  const { nativePush, deleted } = setup({ code: 'messaging/internal-error' });
  const result = await nativePush.sendNativePushToUser('parent', {}, { token: 'android-token' });

  assert.equal(result.failed, 1);
  assert.equal(deleted.length, 0);
});

test('failed Firebase initialization stays unconfigured on subsequent checks', () => {
  const nativePush = loadModule('../utils/nativePushNotifications.js', {
    '../models/NativePushToken': {},
    'firebase-admin/app': { getApps: () => [], cert: () => { throw new Error('Invalid credential'); } },
    'firebase-admin/messaging': { getMessaging: () => assert.fail('Must not initialize messaging') }
  });
  assert.equal(nativePush.isNativePushConfigured(), false);
  assert.equal(nativePush.isNativePushConfigured(), false);
});

test('installed Firebase SDK exposes the app and messaging APIs used by production', () => {
  const { getApps, cert, initializeApp } = require('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging');
  for (const api of [getApps, cert, initializeApp, getMessaging]) assert.equal(typeof api, 'function');
});
