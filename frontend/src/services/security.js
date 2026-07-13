import api from './api.js';

export const verifyPaymentPassword = async (password) => {
  const response = await api.post('/security/payment-password/verify', { password });
  return response.data;
};

export const updatePaymentPassword = async (payload) => {
  const response = await api.put('/security/payment-password', payload);
  return response.data;
};
