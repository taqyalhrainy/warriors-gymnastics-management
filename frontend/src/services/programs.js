import api from './api';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchPrograms = async () => {
  return fetchCached('programs:list', async () => {
    const response = await api.get('/programs');
    return response.data;
  });
};

export const createProgram = async (data) => {
  const response = await api.post('/programs', data);
  invalidateCache(['programs:', 'players:']);
  return response.data;
};

export const updateProgram = async (id, data) => {
  const response = await api.put(`/programs/${id}`, data);
  invalidateCache(['programs:', 'players:']);
  return response.data;
};

export const deleteProgram = async (id) => {
  const response = await api.delete(`/programs/${id}`);
  invalidateCache(['programs:', 'players:']);
  return response.data;
};
