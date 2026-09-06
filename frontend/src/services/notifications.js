import api from './api.js';
import { fetchCached, getCachedValue, invalidateCache } from './cache.js';

const NOTIFICATIONS_CACHE_KEY = 'notifications:list';
const NOTIFICATIONS_CACHE_TTL_MS = 2 * 60 * 1000;

export const fetchNotifications = async () => {
  return fetchCached(NOTIFICATIONS_CACHE_KEY, async () => {
    const response = await api.get('/notifications');
    return response.data;
  }, { ttlMs: NOTIFICATIONS_CACHE_TTL_MS });
};

export const getCachedNotifications = () => getCachedValue(NOTIFICATIONS_CACHE_KEY, { ttlMs: NOTIFICATIONS_CACHE_TTL_MS });

export const fetchNotificationById = async (id) => {
  const response = await api.get(`/notifications/${id}`);
  return response.data;
};

export const fetchUnreadCount = async () => {
  const response = await api.get('/notifications/count');
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
