export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /android/i.test(navigator.userAgent);
export const isPushSupported = () => !window.Capacitor?.isNativePlatform?.() && window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// Call directly from the click handler: do not put this behind a request or timer.
export const requestPhoneNotificationPermission = () => {
  if (globalThis.window?.Capacitor?.isNativePlatform?.()) return Promise.resolve('denied');
  if (Notification.permission === 'granted') return Promise.resolve('granted');
  return Notification.requestPermission();
};

export const observeNotificationPermission = (onChange) => {
  let permissionStatus;
  let disposed = false;
  const refresh = () => {
    if (!disposed && !document.hidden) onChange();
  };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  if (navigator.permissions?.query) {
    navigator.permissions.query({ name: 'notifications' }).then((status) => {
      if (disposed) return;
      permissionStatus = status;
      status.addEventListener('change', refresh);
    }).catch(() => {});
  }
  return () => {
    disposed = true;
    window.removeEventListener('focus', refresh);
    document.removeEventListener('visibilitychange', refresh);
    permissionStatus?.removeEventListener('change', refresh);
  };
};

export const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const uint8ArrayToBase64Url = (bytes) => window.btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

export const getServiceWorkerRegistration = async () => {
  if (window.Capacitor?.isNativePlatform?.()) throw new Error('Web Push is disabled inside the Android app.');
  const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  if (registration.active && !registration.installing && !registration.waiting) return registration;
  await new Promise((resolve, reject) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) {
      reject(new Error('Phone notifications could not start. Reload the app and try again.'));
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      worker.removeEventListener('statechange', checkState);
    };
    const checkState = () => {
      if (worker.state === 'activated') {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(new Error('Phone notifications could not start. Reload the app and try again.'));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Phone notification setup timed out. Please try again.'));
    }, 10000);
    worker.addEventListener('statechange', checkState);
    checkState();
  });
  return registration;
};

export const getPushSubscription = async () => {
  if (!isPushSupported()) return null;
  const registration = await getServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
};

const subscriptionMatchesPublicKey = (subscription, publicKey) => {
  const currentKey = subscription?.options?.applicationServerKey;
  if (!currentKey || !publicKey) return true;
  return uint8ArrayToBase64Url(currentKey) === publicKey;
};

const subscribe = async (publicKey, options = {}) => {
  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  const expired = subscription?.expirationTime && subscription.expirationTime <= Date.now();
  if (subscription && (options.force || expired || !subscriptionMatchesPublicKey(subscription, publicKey))) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  return subscription;
};

let subscriptionOperation = Promise.resolve();
export const createPushSubscription = (publicKey, options = {}) => {
  const operation = subscriptionOperation.then(() => subscribe(publicKey, options));
  subscriptionOperation = operation.catch(() => {});
  return operation;
};

// Subscribe before sending the test so a fast push cannot beat the listener.
export const watchPushReceipt = (testId, timeoutMs = 15000) => {
  let finish;
  const promise = new Promise((resolve) => {
    const receive = (event) => {
      if (event.data?.type === 'push:receipt' && event.data.testId === testId) {
        finish(event.data.displayed ? 'received' : 'display-failed');
      }
    };
    const timer = setTimeout(() => finish('unconfirmed'), timeoutMs);
    finish = (result) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('message', receive);
      resolve(result);
    };
    navigator.serviceWorker.addEventListener('message', receive);
  });
  return { promise, cancel: () => finish('unconfirmed') };
};

export const pushTestMessage = (delivery) => delivery === 'received'
  ? 'This phone received the test notification.'
  : delivery === 'display-failed'
    ? 'This phone received the test, but the browser could not display it.'
    : 'Notifications are registered. Delivery to this phone is not confirmed yet.';
