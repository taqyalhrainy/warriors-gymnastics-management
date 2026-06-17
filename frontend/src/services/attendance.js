import api from './api.js';

export const markPresent = async (data) => {
  const response = await api.post('/attendance/present', data);
  return response.data;
};

export const markAbsent = async (data) => {
  const response = await api.post('/attendance/absent', data);
  return response.data;
};

export const updateTodayAttendance = async (data) => {
  const response = await api.put('/attendance/today', data);
  return response.data;
};

export const cancelTodayAttendance = async (data) => {
  const response = await api.delete('/attendance/today', { data });
  return response.data;
};

export const fetchAttendanceByPlayer = async (playerId) => {
  const response = await api.get(`/attendance/player/${playerId}`);
  return response.data;
};

export const fetchTodayAttendance = async (params) => {
  const response = await api.get('/attendance/today', { params });
  return response.data;
};
