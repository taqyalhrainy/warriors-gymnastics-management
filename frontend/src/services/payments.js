import api from './api.js';

export const fetchPayments = async (params = {}) => {
  const response = await api.get('/payments', { params });
  return response.data;
};

export const createPayment = async (data) => {
  const response = await api.post('/payments', data);
  return response.data;
};

export const fetchPaymentsByPlayer = async (playerId) => {
  const response = await api.get(`/payments/player/${playerId}`);
  return response.data;
};
