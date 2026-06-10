import api from './api.js';

export const fetchPlayers = async (params) => {
  const response = await api.get('/players', { params });
  return response.data;
};

export const createPlayer = async (data) => {
  const response = await api.post('/players', data);
  return response.data;
};

export const updatePlayer = async (id, data) => {
  const response = await api.put(`/players/${id}`, data);
  return response.data;
};

export const deletePlayer = async (id) => {
  const response = await api.delete(`/players/${id}`);
  return response.data;
};

export const getPlayer = async (id) => {
  const response = await api.get(`/players/${id}`);
  return response.data;
};
