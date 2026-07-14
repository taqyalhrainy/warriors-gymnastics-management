import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchWaitingList = async () => {
  return fetchCached('waiting-list:list', async () => {
    const response = await api.get('/waiting-list');
    return response.data;
  });
};

export const createWaitingListEntry = async (data) => {
  const response = await api.post('/waiting-list', data);
  invalidateCache(['waiting-list:']);
  return response.data;
};

export const updateWaitingListEntry = async (id, data) => {
  const response = await api.put(`/waiting-list/${id}`, data);
  invalidateCache(['waiting-list:']);
  return response.data;
};

export const deleteWaitingListEntry = async (id) => {
  const response = await api.delete(`/waiting-list/${id}`);
  invalidateCache(['waiting-list:']);
  return response.data;
};
