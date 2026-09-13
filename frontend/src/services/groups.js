import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';
import { groupBoardPlayers } from '../utils/groupBoardPlayers.js';

export const fetchAttendanceBoard = async (options = {}) => fetchCached('groups:attendance-board', async () => {
  const { data } = await api.get('/groups/attendance-board', { params: { compact: true } });
  return groupBoardPlayers(data);
}, options);

export const fetchGroups = async (options = {}) => {
  return fetchCached('groups:list', async () => {
    const response = await api.get('/groups');
    return response.data;
  }, options);
};

export const fetchGroupPlayers = async (groupId, options = {}) => {
  return fetchCached(`groups:players:${groupId}`, async () => {
    const response = await api.get(`/groups/${groupId}/players`);
    return response.data;
  }, options);
};

export const createGroup = async (data) => {
  const response = await api.post('/groups', data);
  invalidateCache(['groups:', 'players:', 'attendance:', 'reports:']);
  return response.data;
};

export const updateGroup = async (id, data) => {
  const response = await api.put(`/groups/${id}`, data);
  invalidateCache(['groups:', 'players:', 'attendance:', 'reports:']);
  return response.data;
};

export const reorderGroups = async (groupIds) => {
  const response = await api.put('/groups/reorder', { groupIds });
  invalidateCache(['groups:', 'attendance:', 'reports:']);
  return response.data;
};

export const deleteGroup = async (id) => {
  const response = await api.delete(`/groups/${id}`);
  invalidateCache(['groups:', 'players:', 'attendance:', 'reports:']);
  return response.data;
};
