import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const load = async (file, dependencies, globals = {}, env = {}) => {
  const context = vm.createContext(globals);
  const module = new vm.SourceTextModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    context, initializeImportMeta: (meta) => { meta.env = env; }
  });
  await module.link((specifier) => {
    const exports = dependencies[specifier];
    assert.ok(exports, `Unexpected import: ${specifier}`);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
};

const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
};

for (const native of [true, false]) {
  test(`API URL uses ${native ? 'the live backend inside APK' : 'the configured URL on the web'}`, async () => {
    let baseURL;
    const api = { defaults: { headers: { common: {} } }, interceptors: { request: { use() {} }, response: { use() {} } } };
    await load('../src/services/api.js', {
      axios: { default: { create: (config) => { baseURL = config.baseURL; return api; } } },
      '@capacitor/core': { Capacitor: { isNativePlatform: () => native } }
    }, {
      localStorage: storage(), sessionStorage: storage(),
      window: { fetch: async () => ({}) }
    }, { VITE_API_URL: 'http://localhost:5000', PROD: true });
    assert.equal(baseURL, native ? 'https://warriors-gymnastics-management.onrender.com/api' : 'http://localhost:5000/api');
  });
}

test('APK uses native token endpoints and does not resubscribe after Disable', async () => {
  const calls = [];
  const service = await load('../src/services/nativeNotifications.js', {
    '@capacitor/app': { App: { getInfo: async () => ({ version: '2.0' }) } },
    './api.js': { default: {
      post: async (url, body) => { calls.push({ url, body }); },
      delete: async (url) => { calls.push({ url }); }
    } },
    '../utils/nativePushNotifications.js': {
      isNativeAndroidApp: () => true,
      NativePushSession: { setSession: async () => {}, getDevice: async () => ({ deviceId: 'test-device-123456' }) },
      getNativeAndroidPermissionState: async () => 'granted',
      getStoredNativeAndroidToken: () => 'phone-token',
      requestNativeAndroidToken: async () => 'phone-token',
      setupNativePushListeners: async () => {},
      unregisterNativeAndroidPush: async () => {}
    }
  }, { localStorage: storage(), crypto: webcrypto, TextEncoder, Uint8Array, console,
    window: { addEventListener() {} } });
  await service.setNativeNotificationSession({ id: 'parent', role: 'parent' }, 'auth-token');
  await service.enableNativeNotifications();
  assert.equal(calls[0].url, '/push/native/subscribe');
  assert.equal(calls[0].body.token, 'phone-token');
  assert.equal(calls[1].url, '/push/native/test');
  await service.disableNativeNotifications();
  await service.syncNativeNotifications();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, '/push/native/unsubscribe');
});
