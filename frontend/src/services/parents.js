import api from './api';
import { fetchCached, getCachedValue, invalidateCache } from './cache.js';

const PARENT_DASHBOARD_CACHE_KEY = 'parent:dashboard';
const PARENT_ATTENDANCE_CACHE_KEY = 'parent:attendance';
const PARENT_PAYMENTS_CACHE_KEY = 'parent:payments';
const PARENT_CHILDREN_CACHE_KEY = 'parent:children';
const PARENT_CACHE_TTL_MS = 5 * 60 * 1000;

export const fetchParents = async () => {
  return fetchCached('parents:list', async () => {
    const response = await api.get('/parents');
    return response.data;
  });
};

export const createParent = async (data) => {
  const response = await api.post('/parents', data);
  invalidateCache(['parents:', 'players:', 'reports:', 'parent:']);
  return response.data;
};

export const fetchParent = async (id) => {
  const response = await api.get(`/parents/${id}`);
  return response.data;
};

export const updateParent = async (id, data) => {
  const response = await api.put(`/parents/${id}`, data);
  invalidateCache(['parents:', 'players:', 'reports:', 'parent:']);
  return response.data;
};

export const deleteParent = async (id) => {
  const response = await api.delete(`/parents/${id}`);
  invalidateCache(['parents:', 'players:', 'reports:', 'parent:']);
  return response.data;
};

export const fetchCurrentParent = async () => {
  const response = await api.get('/parents/me');
  return response.data;
};

export const fetchParentChildren = async () => {
  return fetchCached(PARENT_CHILDREN_CACHE_KEY, async () => {
    const response = await api.get('/parents/me/children');
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const fetchParentAttendance = async () => {
  return fetchCached(PARENT_ATTENDANCE_CACHE_KEY, async () => {
    const response = await api.get('/parents/me/attendance');
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const fetchParentDashboard = async () => {
  return fetchCached(PARENT_DASHBOARD_CACHE_KEY, async () => {
    const response = await api.get('/parents/me/dashboard');
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const fetchParentPayments = async () => {
  return fetchCached(PARENT_PAYMENTS_CACHE_KEY, async () => {
    const response = await api.get('/parents/me/payments');
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const getCachedParentDashboard = () => getCachedValue(PARENT_DASHBOARD_CACHE_KEY, { ttlMs: PARENT_CACHE_TTL_MS });
export const getCachedParentAttendance = () => getCachedValue(PARENT_ATTENDANCE_CACHE_KEY, { ttlMs: PARENT_CACHE_TTL_MS });
export const getCachedParentPayments = () => getCachedValue(PARENT_PAYMENTS_CACHE_KEY, { ttlMs: PARENT_CACHE_TTL_MS });
