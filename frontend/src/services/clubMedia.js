import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

const PUBLIC_MEDIA_CACHE_KEY = 'club-media:public';
const ADMIN_MEDIA_CACHE_KEY = 'club-media:admin';

export const fetchPublicClubMedia = async () => fetchCached(PUBLIC_MEDIA_CACHE_KEY, async () => {
  const response = await api.get('/club-media/public');
  return response.data;
}, { ttlMs: 2 * 60 * 1000 });

export const fetchAdminClubMedia = async (options = {}) => fetchCached(ADMIN_MEDIA_CACHE_KEY, async () => {
  const response = await api.get('/club-media');
  return response.data;
}, { ttlMs: 60 * 1000, force: options.force });

export const createClubMedia = async (data) => {
  const response = await api.post('/club-media', data);
  invalidateCache(['club-media:']);
  return response.data;
};

export const updateClubMedia = async (id, data) => {
  const response = await api.put(`/club-media/${id}`, data);
  invalidateCache(['club-media:']);
  return response.data;
};

export const deleteClubMedia = async (id) => {
  const response = await api.delete(`/club-media/${id}`);
  invalidateCache(['club-media:']);
  return response.data;
};
