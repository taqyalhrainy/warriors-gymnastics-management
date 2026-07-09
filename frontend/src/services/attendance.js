import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

const invalidateAttendanceRelatedCache = () => {
  invalidateCache(['attendance:', 'players:', 'reports:', 'notifications:']);
};

export const markPresent = async (data) => {
  const response = await api.post('/attendance/present', data);
  invalidateAttendanceRelatedCache();
  return response.data;
};

export const markAbsent = async (data) => {
  const response = await api.post('/attendance/absent', data);
  invalidateAttendanceRelatedCache();
  return response.data;
};

export const updateTodayAttendance = async (data) => {
  const response = await api.put('/attendance/today', data);
  invalidateAttendanceRelatedCache();
  return response.data;
};

export const cancelTodayAttendance = async (data) => {
  const response = await api.delete('/attendance/today', { data });
  invalidateAttendanceRelatedCache();
  return response.data;
};

export const fetchAttendanceByPlayer = async (playerId) => {
  const response = await api.get(`/attendance/player/${playerId}`);
  return response.data;
};

export const fetchTodayAttendance = async (params) => {
  const cacheKey = `attendance:today:${params?.date || 'current'}`;
  if (!params || !Object.keys(params).length || params.date) {
    return fetchCached(cacheKey, async () => {
      const response = await api.get('/attendance/today', { params });
      return response.data;
    });
  }

  const response = await api.get('/attendance/today', { params });
  return response.data;
};
