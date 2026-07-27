import api from './api.js';

export const verifyPaymentPassword = async (password) => {
  const response = await api.post('/security/payment-password/verify', { password }, {
    __skipAuthInvalidation: true
  });
  return response.data;
};

export const updatePaymentPassword = async (payload) => {
  const response = await api.put('/security/payment-password', payload, {
    __skipAuthInvalidation: true
  });
  return response.data;
};
