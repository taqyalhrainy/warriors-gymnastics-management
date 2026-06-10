import api from './api.js';

export const fetchSubscriptions = async (params) => {
  const response = await api.get('/subscriptions', { params });
  return response.data;
};

export const createSubscription = async (data) => {
  const response = await api.post('/subscriptions', data);
  return response.data;
};

export const updateSubscription = async (id, data) => {
  const response = await api.put(`/subscriptions/${id}`, data);
  return response.data;
};

export const deleteSubscription = async (id) => {
  const response = await api.delete(`/subscriptions/${id}`);
  return response.data;
};
