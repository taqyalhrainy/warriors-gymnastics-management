import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchNotifications = async () => {
  return fetchCached('notifications:list', async () => {
    const response = await api.get('/notifications');
    return response.data;
  }, { ttlMs: 2 * 60 * 1000 });
};

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
  invalidateCache(['notifications:']);
  return response.data;
};

export const announceAllParents = async (data) => {
  const response = await api.post('/notifications/announce-all', data);
  invalidateCache(['notifications:']);
  return response.data;
};

export const announceGroupParents = async (data) => {
  const response = await api.post('/notifications/announce-group', data);
  invalidateCache(['notifications:']);
  return response.data;
};
