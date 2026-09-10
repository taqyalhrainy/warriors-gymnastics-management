import api from './api';
import { fetchCached, getCachedValue, invalidateCache } from './cache.js';

const PARENT_DASHBOARD_CACHE_KEY = 'parent:dashboard:v2';
const PARENT_ATTENDANCE_CACHE_KEY = 'parent:attendance';
const PARENT_PAYMENTS_CACHE_KEY = 'parent:payments:v2';
const PARENT_CHILDREN_CACHE_KEY = 'parent:children';
const PARENT_CACHE_TTL_MS = 5 * 60 * 1000;
const PERSIST_PREFIX = 'warriors-cache:';
const AUTH_USER_KEY = 'warriors-user';
const AUTH_REMEMBER_KEY = 'warriors-remember-auth';
const PARENT_REQUEST_OPTIONS = { timeout: 30000, __maxRetries: 3 };

const getStoredUser = () => {
  try {
    const storage = localStorage.getItem(AUTH_REMEMBER_KEY) === 'true' ? localStorage : sessionStorage;
    return JSON.parse(storage.getItem(AUTH_USER_KEY) || 'null');
  } catch (error) {
    return null;
  }
};

const getParentCacheScope = () => {
  const user = getStoredUser();
  return user?.id || user?._id || 'anonymous';
};

const getParentCacheKey = (key) => `${key}:${getParentCacheScope()}`;

const readPersistentCache = (key, ttlMs = PARENT_CACHE_TTL_MS) => {
  try {
    const entry = JSON.parse(localStorage.getItem(`${PERSIST_PREFIX}${key}`) || 'null');
    return entry && (Date.now() - entry.timestamp) < ttlMs ? entry.value : undefined;
  } catch (error) {
    return undefined;
  }
};

const writePersistentCache = (key, value) => {
  try {
    localStorage.setItem(`${PERSIST_PREFIX}${key}`, JSON.stringify({ value, timestamp: Date.now() }));
  } catch (error) {
    // Storage can be unavailable on some private browsers.
  }
};

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
  const response = await api.get('/parents/me', PARENT_REQUEST_OPTIONS);
  return response.data;
};

export const fetchParentChildren = async () => {
  const cacheKey = getParentCacheKey(PARENT_CHILDREN_CACHE_KEY);
  return fetchCached(cacheKey, async () => {
    const response = await api.get('/parents/me/children', PARENT_REQUEST_OPTIONS);
    writePersistentCache(cacheKey, response.data);
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const fetchParentAttendance = async () => {
  const cacheKey = getParentCacheKey(PARENT_ATTENDANCE_CACHE_KEY);
  return fetchCached(cacheKey, async () => {
    const response = await api.get('/parents/me/attendance', PARENT_REQUEST_OPTIONS);
    writePersistentCache(cacheKey, response.data);
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const fetchParentAttendanceHistory = async (playerId) => {
  return fetchCached(getParentCacheKey(`${PARENT_ATTENDANCE_CACHE_KEY}:history:${playerId}`), async () => {
    const response = await api.get(`/parents/me/attendance/${playerId}/history`, PARENT_REQUEST_OPTIONS);
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS });
};

export const fetchParentDashboard = async (params = {}) => {
  const cacheKey = getParentCacheKey(PARENT_DASHBOARD_CACHE_KEY);
  return fetchCached(cacheKey, async () => {
    const response = await api.get('/parents/me/dashboard', PARENT_REQUEST_OPTIONS);
    writePersistentCache(cacheKey, response.data);
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS, force: params.force });
};

export const fetchParentPayments = async (params = {}) => {
  const cacheKey = getParentCacheKey(PARENT_PAYMENTS_CACHE_KEY);
  return fetchCached(cacheKey, async () => {
    const response = await api.get('/parents/me/payments', PARENT_REQUEST_OPTIONS);
    writePersistentCache(cacheKey, response.data);
    return response.data;
  }, { ttlMs: PARENT_CACHE_TTL_MS, force: params.force });
};

export const getCachedParentDashboard = () => {
  const cacheKey = getParentCacheKey(PARENT_DASHBOARD_CACHE_KEY);
  return getCachedValue(cacheKey, { ttlMs: PARENT_CACHE_TTL_MS }) || readPersistentCache(cacheKey);
};

export const getCachedParentAttendance = () => {
  const cacheKey = getParentCacheKey(PARENT_ATTENDANCE_CACHE_KEY);
  return getCachedValue(cacheKey, { ttlMs: PARENT_CACHE_TTL_MS }) || readPersistentCache(cacheKey);
};

export const getCachedParentPayments = () => {
  const cacheKey = getParentCacheKey(PARENT_PAYMENTS_CACHE_KEY);
  return getCachedValue(cacheKey, { ttlMs: PARENT_CACHE_TTL_MS }) || readPersistentCache(cacheKey);
};
