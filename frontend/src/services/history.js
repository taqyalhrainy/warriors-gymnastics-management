import api from './api.js';

export const fetchHistorySnapshot = async ({ entityType, at }) => {
  const response = await api.get('/history', {
    params: { entityType, at }
  });

  return response.data;
};
