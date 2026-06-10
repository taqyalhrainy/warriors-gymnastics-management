import api from './api';

export const fetchParents = async () => {
  const response = await api.get('/parents');
  return response.data;
};

export const createParent = async (data) => {
  const response = await api.post('/parents', data);
  return response.data;
};

export const fetchParent = async (id) => {
  const response = await api.get(`/parents/${id}`);
  return response.data;
};

export const updateParent = async (id, data) => {
  const response = await api.put(`/parents/${id}`, data);
  return response.data;
};

export const deleteParent = async (id) => {
  const response = await api.delete(`/parents/${id}`);
  return response.data;
};

export const fetchCurrentParent = async () => {
  const response = await api.get('/parents/me');
  return response.data;
};

export const fetchParentChildren = async () => {
  const response = await api.get('/parents/me/children');
  return response.data;
};

export const fetchParentAttendance = async () => {
  const response = await api.get('/parents/me/attendance');
  return response.data;
};

export const fetchParentDashboard = async () => {
  const response = await api.get('/parents/me/dashboard');
  return response.data;
};

export const fetchParentPayments = async () => {
  const response = await api.get('/parents/me/payments');
  return response.data;
};