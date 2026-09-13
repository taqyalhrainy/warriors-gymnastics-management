import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchPayments = async (params = {}) => {
  const { fresh, ...query } = params;
  const entries = Object.entries(query).sort(([a], [b]) => a.localeCompare(b));
  const key = entries.length ? `payments:list:${JSON.stringify(entries)}` : 'payments:list';
  return fetchCached(key, async () => {
    const response = await api.get('/payments', { params: query });
    return response.data;
  }, { force: Boolean(fresh) });
};

export const createPayment = async (data) => {
  const response = await api.post('/payments', data);
  invalidateCache(['payments:', 'players:', 'groups:', 'attendance:', 'history:', 'reports:', 'notifications:', 'parent:']);
  window.dispatchEvent(new CustomEvent('payments:changed', { detail: { action: 'create', ...response.data, requestedPayment: data } }));
  return response.data;
};

export const updatePayment = async (id, data) => {
  const response = await api.put(`/payments/${id}`, data);
  invalidateCache(['payments:', 'players:', 'groups:', 'attendance:', 'history:', 'reports:', 'parent:']);
  window.dispatchEvent(new CustomEvent('payments:changed', { detail: { action: 'update', ...response.data, requestedPayment: data } }));
  return response.data;
};

export const deletePayment = async (id) => {
  const response = await api.delete(`/payments/${id}`);
  invalidateCache(['payments:', 'players:', 'groups:', 'attendance:', 'history:', 'reports:', 'parent:']);
  window.dispatchEvent(new CustomEvent('payments:changed', { detail: { action: 'delete', ...response.data } }));
  return response.data;
};

export const fetchPaymentsByPlayer = async (playerId) => {
  return fetchCached(`payments:player:${playerId}`, async () => {
    const response = await api.get(`/payments/player/${playerId}`);
    return response.data;
  });
};
