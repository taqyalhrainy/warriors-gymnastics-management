import api from './api.js';

export const fetchNotifications = async () => {
  const response = await api.get('/notifications');
  return response.data;
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
  return response.data;
};

export const announceAllParents = async (data) => {
  const response = await api.post('/notifications/announce-all', data);
  return response.data;
};

export const announceGroupParents = async (data) => {
  const response = await api.post('/notifications/announce-group', data);
  return response.data;
};
