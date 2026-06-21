import api from './api.js';
import { fetchCached, invalidateCache, setCached } from './cache.js';

export const fetchPlayers = async (params) => {
  if (params && Object.keys(params).length) {
    const response = await api.get('/players', { params });
    return response.data;
  }

  return fetchCached('players:list', async () => {
    const response = await api.get('/players');
    return response.data;
  });
};

const invalidatePlayerRelatedCache = (playerId) => {
  invalidateCache([
    'players:',
    'groups:',
    'payments:',
    'attendance:'
  ]);
  if (playerId) {
    invalidateCache([`players:item:${playerId}`]);
  }
};

export const createPlayer = async (data) => {
  const response = await api.post('/players', data);
  invalidatePlayerRelatedCache(response.data?._id);
  window.dispatchEvent(new Event('players:changed'));
  return response.data;
};

export const updatePlayer = async (id, data) => {
  const response = await api.put(`/players/${id}`, data);
  invalidateCache([
    'players:list',
    'groups:',
    'payments:',
    'attendance:'
  ]);
  setCached(`players:item:${id}`, response.data);
  window.dispatchEvent(new Event('players:changed'));
  return response.data;
};

export const deletePlayer = async (id) => {
  const response = await api.delete(`/players/${id}`);
  invalidatePlayerRelatedCache(id);
  window.dispatchEvent(new Event('players:changed'));
  return response.data;
};

export const getPlayer = async (id) => {
  return fetchCached(`players:item:${id}`, async () => {
    const response = await api.get(`/players/${id}`);
    return response.data;
  });
};
