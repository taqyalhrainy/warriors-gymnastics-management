import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchCoaches = async (params = {}) => {
  if (params.fresh) {
    const response = await api.get('/coaches', { params });
    return response.data;
  }
  const cacheKey = params.date ? `coaches:list:${params.date}` : 'coaches:list';
  return fetchCached(cacheKey, async () => {
    const response = await api.get('/coaches', { params });
    return response.data;
  });
};

export const createCoach = async (data) => {
  const response = await api.post('/coaches', data);
  invalidateCache(['coaches:', 'players:', 'reports:']);
  return response.data;
};

export const updateCoach = async (id, data) => {
  const response = await api.put(`/coaches/${id}`, data);
  invalidateCache(['coaches:', 'players:', 'reports:']);
  return response.data;
};

export const deleteCoach = async (id) => {
  const response = await api.delete(`/coaches/${id}`);
  invalidateCache(['coaches:', 'players:', 'reports:']);
  return response.data;
};

export const updateCoachAttendance = async (id, data) => {
  const response = await api.post(`/coaches/${id}/attendance`, data);
  invalidateCache(['coaches:']);
  return response.data;
};
