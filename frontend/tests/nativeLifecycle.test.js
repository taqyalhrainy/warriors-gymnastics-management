import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { load, storage } from './moduleHarness.js';

const setup = async (options = {}) => {
  const calls = [], gates = [], events = {};
  const localStorage = storage();
  const service = await load('../src/services/nativeNotifications.js', {
    './api.js': { default: {
      post: async (url, body, config) => { calls.push({ url, body, config }); await options.post?.(url); },
      delete: async (url, config) => { calls.push({ url, config }); if (options.offline) throw new Error('Offline'); }
    } },
    '@capacitor/app': { App: { getInfo: async () => ({ version: '2.0' }) } },
    '../utils/nativePushNotifications.js': {
      isNativeAndroidApp: () => options.native !== false,
      NativePushSession: { setSession: async (value) => gates.push(value),
        getDevice: async () => ({ deviceId: 'device-1234567890' }) },
      getNativeAndroidPermissionState: async () => options.permission || 'granted',
      getStoredNativeAndroidToken: () => 'token-1',
      requestNativeAndroidToken: async (opts) => { options.request?.(opts); return 'token-1'; },
      setupNativePushListeners: async () => {}, unregisterNativeAndroidPush: async () => { gates.push({ deleted: true }); }
    }
  }, { localStorage, crypto: webcrypto, TextEncoder, Uint8Array, console,
    window: { addEventListener: (name, fn) => { events[name] = fn; } } });
  return { service, calls, gates, events, localStorage };
};
const parent = { id: 'parent-1', role: 'parent' };

test('automatic sync is authenticated, per-device, session-bound and never prompts', async () => {
  let prompt;
  const { service, calls } = await setup({ request: (value) => { prompt = value.prompt; } });
  await service.setNativeNotificationSession(parent, 'jwt-parent1');
  await service.syncNativeNotifications();
  assert.equal(prompt, false);
  assert.equal(calls[0].body.deviceId, 'device-1234567890');
  assert.equal(calls[0].body.transportVersion, 2);
  assert.match(calls[0].body.sessionId, /^[a-f0-9]{64}$/);
  assert.equal(calls[0].config.headers.Authorization, 'Bearer jwt-parent1');
});

test('token refresh listener persists replacement for the current authenticated user', async () => {
  const { service, events, calls } = await setup();
  await service.setNativeNotificationSession(parent, 'jwt-parent1');
  events['native-push:token']({ detail: 'rotated-token' });
  await service.syncNativeNotifications();
  assert.ok(calls.some(({ body }) => body?.token === 'rotated-token'));
});

test('offline logout closes native delivery immediately and never re-registers', async () => {
  const { service, gates, calls, events } = await setup({ offline: true });
  await service.setNativeNotificationSession(parent, 'jwt-parent1');
  const logout = service.setNativeNotificationSession(null, null);
  assert.equal(gates.at(-1).userId, '');
  await logout;
  events['native-push:token']({ detail: 'late-token' });
  await service.syncNativeNotifications();
  assert.equal(calls.filter(({ url }) => url.endsWith('/subscribe')).length, 0);
  assert.ok(gates.some((gate) => gate.deleted));
});

test('account switch during registration cleans the old owner using the old credentials', async () => {
  let started, finish;
  const began = new Promise((resolve) => { started = resolve; });
  const wait = new Promise((resolve) => { finish = resolve; });
  let first = true;
  const { service, calls } = await setup({ post: async (url) => {
    if (first && url.endsWith('/subscribe')) { first = false; started(); await wait; }
  } });
  await service.setNativeNotificationSession(parent, 'jwt-parent1');
  const syncing = service.syncNativeNotifications();
  await began;
  const switched = service.setNativeNotificationSession({ id: 'parent-2', role: 'parent' }, 'jwt-parent2');
  finish();
  await syncing;
  await switched;
  await service.syncNativeNotifications();
  const writes = calls.filter(({ url }) => url.endsWith('/subscribe'));
  assert.equal(writes[0].config.headers.Authorization, 'Bearer jwt-parent1');
  assert.equal(writes[1].config.headers.Authorization, 'Bearer jwt-parent2');
  assert.notEqual(writes[0].body.sessionId, writes[1].body.sessionId);
  assert.ok(calls.some(({ url, config }) => url.endsWith('/unsubscribe') && config.headers.Authorization === 'Bearer jwt-parent1'));
});

test('website and iPhone never invoke native registration', async () => {
  const { service, gates, calls } = await setup({ native: false });
  await service.setNativeNotificationSession(parent, 'jwt');
  await service.syncNativeNotifications();
  assert.equal(gates.length, 0);
  assert.equal(calls.length, 0);
});

test('a denied Android permission is not prompted by automatic sync', async () => {
  const { service, calls } = await setup({ permission: 'denied', request: () => assert.fail('No prompt') });
  await service.setNativeNotificationSession(parent, 'jwt');
  await service.syncNativeNotifications();
  assert.equal(calls.length, 0);
});

test('native detection does not fall back to Web Push when the plugin is missing', async () => {
  const module = await load('../src/utils/nativePushNotifications.js', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', isPluginAvailable: () => false }, registerPlugin: () => ({}) },
    '@capacitor/push-notifications': { PushNotifications: {} }
  });
  assert.equal(module.isNativeAndroidApp(), true);
  for (const url of ['https://evil.test', '//evil.test', '/\\evil.test', '/parent/../admin', '/parent/%2f%2fevil', '/admin']) {
    assert.equal(module.safeNotificationUrl(url), '/parent/notifications');
  }
  assert.equal(module.safeNotificationUrl('/parent/notifications/0123456789abcdef01234567'), '/parent/notifications/0123456789abcdef01234567');
  assert.equal(module.safeNotificationUrl('/parent/payments'), '/parent/payments');
});
