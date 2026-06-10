import api from './api.js';

export const fetchCoaches = async () => {
  const response = await api.get('/coaches');
  return response.data;
};

export const createCoach = async (data) => {
  const response = await api.post('/coaches', data);
  return response.data;
};

export const updateCoach = async (id, data) => {
  const response = await api.put(`/coaches/${id}`, data);
  return response.data;
};

export const deleteCoach = async (id) => {
  const response = await api.delete(`/coaches/${id}`);
  return response.data;
};