import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

const invalidateSubscriptionRelatedCache = () => {
  invalidateCache(['subscriptions:', 'players:', 'payments:', 'attendance:', 'reports:']);
};

export const fetchSubscriptions = async (params) => {
  if (!params || !Object.keys(params).length) {
    return fetchCached('subscriptions:list', async () => {
      const response = await api.get('/subscriptions');
      return response.data;
    });
  }

  const response = await api.get('/subscriptions', { params });
  return response.data;
};

export const createSubscription = async (data) => {
  const response = await api.post('/subscriptions', data);
  invalidateSubscriptionRelatedCache();
  return response.data;
};

export const updateSubscription = async (id, data) => {
  const response = await api.put(`/subscriptions/${id}`, data);
  invalidateSubscriptionRelatedCache();
  return response.data;
};

export const deleteSubscription = async (id) => {
  const response = await api.delete(`/subscriptions/${id}`);
  invalidateSubscriptionRelatedCache();
  return response.data;
};
