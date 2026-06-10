import api from './api.js';

export const fetchGroups = async () => {
  const response = await api.get('/groups');
  return response.data;
};

export const fetchGroupPlayers = async (groupId) => {
  const response = await api.get(`/groups/${groupId}/players`);
  return response.data;
};

export const createGroup = async (data) => {
  const response = await api.post('/groups', data);
  return response.data;
};

export const updateGroup = async (id, data) => {
  const response = await api.put(`/groups/${id}`, data);
  return response.data;
};

export const deleteGroup = async (id) => {
  const response = await api.delete(`/groups/${id}`);
  return response.data;
};
