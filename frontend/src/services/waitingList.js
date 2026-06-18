import api from './api.js';

export const fetchWaitingList = async () => {
  const response = await api.get('/waiting-list');
  return response.data;
};

export const createWaitingListEntry = async (data) => {
  const response = await api.post('/waiting-list', data);
  return response.data;
};

export const deleteWaitingListEntry = async (id) => {
  const response = await api.delete(`/waiting-list/${id}`);
  return response.data;
};
