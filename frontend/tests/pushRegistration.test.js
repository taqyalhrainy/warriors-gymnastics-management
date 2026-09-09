import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/notifications.js', import.meta.url), 'utf8');
const setup = async ({ post, permission = 'granted', delivery = 'received' } = {}) => {
  const calls = [];
  const storage = new Map();
  let renewals = 0;
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/this-phone',
    toJSON() { return { endpoint: this.endpoint }; },
    unsubscribe: async () => { calls.push('unsubscribe'); }
  };
  const context = vm.createContext({
    Notification: { permission },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    window: { dispatchEvent() {} },
    Event,
    crypto: { randomUUID: () => 'test-id' },
    setTimeout: (callback) => { callback(); }
  });
  const dependencies = {
    './api.js': { default: {
      get: async () => ({ data: { publicKey: 'public', configured: true, subscribed: true } }),
      post: async (url, body, options) => {
        calls.push(url);
        return post ? post(url, body, options) : { data: {} };
      },
      delete: async () => { calls.push('delete'); }
    } },
    './cache.js': { fetchCached() {}, getCachedValue() {}, invalidateCache() {} },
    '../utils/pushNotifications.js': {
      isPushSupported: () => true,
      getPushSubscription: async () => subscription,
      createPushSubscription: async (_key, options) => {
        if (options?.force) renewals += 1;
        return subscription;
      },
      watchPushReceipt: () => ({ promise: Promise.resolve(delivery), cancel() {} })
    }
  };
  const module = new vm.SourceTextModule(source, { context });
  await module.link((specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Unexpected import: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
    }, { context });
  });
  await module.evaluate();
  return { service: module.namespace, calls, renewals: () => renewals };
};

test('a timed-out registration is saved automatically on retry', async () => {
  let attempts = 0;
  const { service } = await setup({ post: async (url, _body, options) => {
    assert.equal(url, '/push/subscribe');
    assert.equal(options.__allowWhenNetworkBlocked, true);
    if (++attempts === 1) throw new Error('Network timeout');
    return { data: {} };
  } });
  await service.syncCurrentDevicePushSubscription();
  assert.equal(attempts, 2);
});

test('disable remains disabled when automatic synchronization resumes', async () => {
  const { service, calls } = await setup();
  await service.disableCurrentDeviceNotifications();
  await service.syncCurrentDevicePushSubscription();
  assert.deepEqual(calls, ['delete', 'unsubscribe']);
  assert.equal((await service.fetchCurrentDevicePushStatus()).subscribed, false);
});

test('automatic sync never asks for or circumvents denied permission', async () => {
  const { service, calls } = await setup({ permission: 'denied' });
  await service.syncCurrentDevicePushSubscription();
  assert.equal(calls.length, 0);
});

test('server acceptance without a phone receipt stays unconfirmed and does not churn subscriptions', async () => {
  const { service, renewals } = await setup({ delivery: 'unconfirmed' });
  const result = await service.registerAndTestPushSubscription();
  assert.equal(result.delivery, 'unconfirmed');
  assert.equal(renewals(), 0);
});

test('an expired endpoint renews once and tests the current phone again', async () => {
  let tests = 0;
  const { service, renewals } = await setup({ post: async (url, body) => {
    if (url === '/push/test') {
      assert.equal(body.testId, 'test-id');
      assert.equal(body.endpoint, 'https://fcm.googleapis.com/this-phone');
      if (++tests === 1) throw { response: { data: { deleted: 1 } } };
    }
    return { data: {} };
  } });
  assert.equal((await service.registerAndTestPushSubscription()).delivery, 'received');
  assert.equal(renewals(), 1);
  assert.equal(tests, 2);
});

test('authentication failures do not retry subscription writes', async () => {
  let attempts = 0;
  const { service } = await setup({ post: async () => {
    attempts += 1;
    throw { response: { status: 401 } };
  } });
  await assert.rejects(service.syncCurrentDevicePushSubscription());
  assert.equal(attempts, 1);
});
