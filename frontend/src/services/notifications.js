import api from './api.js';
import { fetchCached, getCachedValue, invalidateCache } from './cache.js';

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
  const response = await api.get('/notifications/push/public-key');
  return response.data.publicKey;
};

export const savePushSubscription = async (subscription) => {
  await api.post('/notifications/push/subscribe', subscription);
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
