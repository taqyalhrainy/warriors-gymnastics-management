import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushSubscription, getServiceWorkerRegistration, watchPushReceipt, requestPhoneNotificationPermission, observeNotificationPermission } from '../src/utils/pushNotifications.js';

const setup = (t, registration) => {
  const calls = [];
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    serviceWorker: {
      ready: new Promise(() => {}),
      register: async (...args) => { calls.push(args); return registration; }
    }
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { atob, btoa } });
  t.after(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  return calls;
};

test('uses its own active registration even if navigator.ready is pending', async (t) => {
  const registration = { active: {} };
  const calls = setup(t, registration);
  assert.equal(await getServiceWorkerRegistration(), registration);
  assert.deepEqual(calls[0], ['/sw.js', { scope: '/', updateViaCache: 'none' }]);
});

test('waits for activation instead of returning an unusable registration', async (t) => {
  const worker = new EventTarget();
  worker.state = 'installing';
  const registration = { installing: worker };
  setup(t, registration);
  const pending = getServiceWorkerRegistration();
  await Promise.resolve();
  worker.state = 'activated';
  worker.dispatchEvent(new Event('statechange'));
  assert.equal(await pending, registration);
});

test('a stale VAPID key renews the subscription before returning it', async (t) => {
  let unsubscribed = false;
  const fresh = { endpoint: 'fresh' };
  setup(t, {
    active: {},
    pushManager: {
      getSubscription: async () => ({
        options: { applicationServerKey: new Uint8Array([1, 2, 3]).buffer },
        unsubscribe: async () => { unsubscribed = true; }
      }),
      subscribe: async (options) => {
        assert.equal(unsubscribed, true);
        assert.equal(options.userVisibleOnly, true);
        assert.deepEqual([...options.applicationServerKey], [4, 5, 6]);
        return fresh;
      }
    }
  });
  assert.equal(await createPushSubscription('BAUG'), fresh);
});

test('failed unsubscribe is surfaced instead of pretending renewal succeeded', async (t) => {
  setup(t, {
    active: {},
    pushManager: {
      getSubscription: async () => ({ unsubscribe: async () => { throw new Error('offline'); } }),
      subscribe: async () => assert.fail('Must not subscribe after renewal failed')
    }
  });
  await assert.rejects(createPushSubscription('BAUG', { force: true }), /offline/);
});

test('concurrent setup reuses one subscription instead of racing the browser', async (t) => {
  let subscription = null;
  let calls = 0;
  setup(t, {
    active: {},
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: async () => { calls += 1; subscription = { endpoint: 'fresh' }; return subscription; }
    }
  });
  const [first, second] = await Promise.all([createPushSubscription('BAUG'), createPushSubscription('BAUG')]);
  assert.equal(first, second);
  assert.equal(calls, 1);
});

test('expired subscription renews even when the VAPID key did not change', async (t) => {
  let removed = false;
  setup(t, {
    active: {},
    pushManager: {
      getSubscription: async () => ({ expirationTime: Date.now() - 1, unsubscribe: async () => { removed = true; } }),
      subscribe: async () => { assert.equal(removed, true); return { endpoint: 'fresh' }; }
    }
  });
  assert.equal((await createPushSubscription('BAUG')).endpoint, 'fresh');
});

test('waits for a worker update even when the old worker is active', async (t) => {
  const worker = new EventTarget();
  worker.state = 'installing';
  const registration = { active: {}, installing: worker };
  setup(t, registration);
  let complete = false;
  const pending = getServiceWorkerRegistration().then(() => { complete = true; });
  await Promise.resolve();
  assert.equal(complete, false);
  worker.state = 'activated';
  worker.dispatchEvent(new Event('statechange'));
  await pending;
  assert.equal(complete, true);
});

test('device confirmation requires the matching push, not server acceptance', async (t) => {
  setup(t, {});
  const worker = new EventTarget();
  navigator.serviceWorker = worker;
  const receipt = watchPushReceipt('expected', 100);
  worker.dispatchEvent(new MessageEvent('message', { data: { type: 'push:receipt', testId: 'another', displayed: true } }));
  worker.dispatchEvent(new MessageEvent('message', { data: { type: 'push:receipt', testId: 'expected', displayed: true } }));
  assert.equal(await receipt.promise, 'received');
});

test('missing device receipt is reported as unconfirmed', async (t) => {
  setup(t, {});
  navigator.serviceWorker = new EventTarget();
  assert.equal(await watchPushReceipt('missing', 1).promise, 'unconfirmed');
});

test('notification display rejection is not reported as success', async (t) => {
  setup(t, {});
  navigator.serviceWorker = new EventTarget();
  const receipt = watchPushReceipt('expected', 100);
  navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
    data: { type: 'push:receipt', testId: 'expected', displayed: false }
  }));
  assert.equal(await receipt.promise, 'display-failed');
});

test('the browser permission request runs synchronously during the Enable gesture', async (t) => {
  let requested = false;
  t.mock.method(globalThis, 'setTimeout', () => assert.fail('Permission must not wait for a timer'));
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'Notification');
  Object.defineProperty(globalThis, 'Notification', { configurable: true, value: {
    permission: 'default',
    requestPermission: () => { requested = true; return Promise.resolve('granted'); }
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'Notification', previous);
    else delete globalThis.Notification;
  });
  const result = requestPhoneNotificationPermission();
  assert.equal(requested, true);
  assert.equal(await result, 'granted');
});

test('permission changes and returning to the app refresh the state, with cleanup', async (t) => {
  setup(t, {});
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const documentEvents = new EventTarget();
  Object.defineProperty(globalThis, 'document', { configurable: true, value: documentEvents });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  const permissionStatus = new EventTarget();
  navigator.permissions = { query: async () => permissionStatus };
  let refreshes = 0;
  const stop = observeNotificationPermission(() => { refreshes += 1; });
  await Promise.resolve();
  permissionStatus.dispatchEvent(new Event('change'));
  window.dispatchEvent(new Event('focus'));
  assert.equal(refreshes, 2);
  stop();
  permissionStatus.dispatchEvent(new Event('change'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(refreshes, 2);
});
