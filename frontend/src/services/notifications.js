import api from './api.js';
import { fetchCached, getCachedValue, invalidateCache } from './cache.js';
import {
  createPushSubscription, getPushSubscription, isPushSupported, watchPushReceipt
} from '../utils/pushNotifications.js';

const NOTIFICATIONS_CACHE_KEY = 'notifications:list';
const NOTIFICATIONS_CACHE_TTL_MS = 2 * 60 * 1000;

export const fetchNotifications = async (params = {}) => {
  const query = params.date ? `?date=${encodeURIComponent(params.date)}` : '';
  const cacheKey = params.date ? `${NOTIFICATIONS_CACHE_KEY}:${params.date}` : NOTIFICATIONS_CACHE_KEY;
  return fetchCached(cacheKey, async () => {
    const response = await api.get(`/notifications${query}`);
    return response.data;
  }, { ttlMs: NOTIFICATIONS_CACHE_TTL_MS, force: params.force });
};

export const getCachedNotifications = () => getCachedValue(NOTIFICATIONS_CACHE_KEY, { ttlMs: NOTIFICATIONS_CACHE_TTL_MS });

export const fetchNotificationById = async (id) => {
  const response = await api.get(`/notifications/${id}`);
  invalidateCache(['notifications:', 'parent:']);
  return response.data;
};

export const fetchUnreadCount = async () => {
  const response = await api.get('/notifications/count');
  return response.data;
};

export const fetchPushPublicKey = async () => {
  const response = await api.get('/push/public-key');
  return response.data.publicKey;
};

export const savePushSubscription = async (subscription) => {
  // This upsert is safe to repeat after a timeout or a sleeping server.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await api.post('/push/subscribe', subscription, { __allowWhenNetworkBlocked: true });
      return;
    } catch (error) {
      const status = error.response?.status;
      if (attempt >= 2 || (status && status !== 408 && status !== 429 && status < 500)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
};

export const deletePushSubscription = async (subscription) => {
  await api.delete('/push/unsubscribe', { data: subscription });
};

export const sendTestPushNotification = async (endpoint, testId) => {
  const response = await api.post('/push/test', { endpoint, testId }, { timeout: 25000 });
  return response.data;
};

const PUSH_DISABLED_KEY = 'warriors-web-push-disabled';
let deviceOperation = Promise.resolve();
const updateDevice = (callback) => {
  const operation = deviceOperation.then(callback);
  deviceOperation = operation.catch(() => {});
  return operation;
};

export const syncCurrentDevicePushSubscription = () => updateDevice(async () => {
  if (!isPushSupported() || Notification.permission !== 'granted'
    || localStorage.getItem(PUSH_DISABLED_KEY) === 'true') return;
  const publicKey = await fetchPushPublicKey();
  if (!publicKey) return;
  const subscription = await createPushSubscription(publicKey);
  await savePushSubscription(subscription.toJSON());
  window.dispatchEvent(new Event('push:changed'));
});

export const fetchCurrentDevicePushStatus = async () => {
  const serverStatus = await fetchPushStatus();
  if (!isPushSupported() || Notification.permission !== 'granted'
    || localStorage.getItem(PUSH_DISABLED_KEY) === 'true') {
    return { ...serverStatus, subscribed: false };
  }
  if (!serverStatus.configured) return { ...serverStatus, subscribed: false, native: false };
  const subscription = await getPushSubscription();
  if (!subscription) return { ...serverStatus, subscribed: false, native: false };
  const subscriptionStatus = await fetchPushStatus(subscription.endpoint).catch(() => ({ subscribed: false }));
  return { ...serverStatus, ...subscriptionStatus, native: false };
};

export const registerAndTestPushSubscription = () => updateDevice(async () => {
  const publicKey = await fetchPushPublicKey();
  if (!publicKey) throw new Error('Push is not configured on the server yet.');
  let subscription = await createPushSubscription(publicKey);
  await savePushSubscription(subscription.toJSON());
  localStorage.removeItem(PUSH_DISABLED_KEY);
  const testId = crypto.randomUUID();
  let receipt;
  try {
    for (let attempt = 0; ; attempt += 1) {
      receipt = watchPushReceipt(testId);
      try {
        await sendTestPushNotification(subscription.endpoint, testId);
        break;
      } catch (error) {
        receipt.cancel();
        if (attempt || !error.response?.data?.deleted) throw error;
        subscription = await createPushSubscription(publicKey, { force: true });
        await savePushSubscription(subscription.toJSON());
      }
    }
    const delivery = await receipt.promise;
    window.dispatchEvent(new Event('push:changed'));
    return { subscription, delivery };
  } finally {
    receipt?.cancel();
  }
});

export const disableCurrentDeviceNotifications = () => updateDevice(async () => {
  localStorage.setItem(PUSH_DISABLED_KEY, 'true');
  const subscription = await getPushSubscription();
  if (subscription) {
    await deletePushSubscription({ endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  window.dispatchEvent(new Event('push:changed'));
});

export const fetchPushStatus = async (endpoint = '') => {
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  const response = await api.get(`/push/status${query}`);
  return response.data;
};

export const fetchSavedNotificationMessages = async (params = {}) => {
  return fetchCached('notifications:saved', async () => {
    const response = await api.get('/notifications/saved');
    return response.data;
  }, { ttlMs: NOTIFICATIONS_CACHE_TTL_MS, force: params.force });
};

export const createSavedNotificationMessage = async (data) => {
  const response = await api.post('/notifications/saved', data);
  invalidateCache(['notifications:saved']);
  return response.data;
};

export const updateSavedNotificationMessage = async (id, data) => {
  const response = await api.put(`/notifications/saved/${id}`, data);
  invalidateCache(['notifications:saved']);
  return response.data;
};

export const deleteSavedNotificationMessage = async (id) => {
  const response = await api.delete(`/notifications/saved/${id}`);
  invalidateCache(['notifications:saved']);
  return response.data;
};

export const sendNotification = async (data) => {
  const response = await api.post('/notifications', data);
  invalidateCache(['notifications:', 'parent:']);
  return response.data;
};

export const announceAllParents = async (data) => {
  const response = await api.post('/notifications/announce-all', data);
  invalidateCache(['notifications:', 'parent:']);
  return response.data;
};

export const announceGroupParents = async (data) => {
  const response = await api.post('/notifications/announce-group', data);
  invalidateCache(['notifications:', 'parent:']);
  return response.data;
};
