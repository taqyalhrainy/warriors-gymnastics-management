import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchPayments = async (params = {}) => {
  if (Object.keys(params).length) {
    const response = await api.get('/payments', { params });
    return response.data;
  }

  return fetchCached('payments:list', async () => {
    const response = await api.get('/payments');
    return response.data;
  });
};

export const createPayment = async (data) => {
  const response = await api.post('/payments', data);
  invalidateCache(['payments:', 'players:', 'history:']);
  return response.data;
};

export const updatePayment = async (id, data) => {
  const response = await api.put(`/payments/${id}`, data);
  invalidateCache(['payments:', 'players:', 'history:']);
  return response.data;
};

export const deletePayment = async (id) => {
  const response = await api.delete(`/payments/${id}`);
  invalidateCache(['payments:', 'players:', 'history:']);
  return response.data;
};

export const fetchPaymentsByPlayer = async (playerId) => {
  return fetchCached(`payments:player:${playerId}`, async () => {
    const response = await api.get(`/payments/player/${playerId}`);
    return response.data;
  });
};
