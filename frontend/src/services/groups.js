import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchGroups = async () => {
  return fetchCached('groups:list', async () => {
    const response = await api.get('/groups');
    return response.data;
  });
};

export const fetchGroupPlayers = async (groupId) => {
  return fetchCached(`groups:players:${groupId}`, async () => {
    const response = await api.get(`/groups/${groupId}/players`);
    return response.data;
  });
};

export const createGroup = async (data) => {
  const response = await api.post('/groups', data);
  invalidateCache(['groups:', 'players:', 'attendance:']);
  return response.data;
};

export const updateGroup = async (id, data) => {
  const response = await api.put(`/groups/${id}`, data);
  invalidateCache(['groups:', 'players:', 'attendance:']);
  return response.data;
};

export const reorderGroups = async (groupIds) => {
  const response = await api.put('/groups/reorder', { groupIds });
  invalidateCache(['groups:', 'attendance:']);
  return response.data;
};

export const deleteGroup = async (id) => {
  const response = await api.delete(`/groups/${id}`);
  invalidateCache(['groups:', 'players:', 'attendance:']);
  return response.data;
};
