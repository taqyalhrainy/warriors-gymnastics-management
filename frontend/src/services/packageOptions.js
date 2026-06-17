import api from './api.js';
import { fetchCached, invalidateCache } from './cache.js';

export const fetchPackageOptions = async () => {
  return fetchCached('package-options:list', async () => {
    const response = await api.get('/package-options');
    return response.data;
  });
};

export const createPackageOption = async (data) => {
  const response = await api.post('/package-options', data);
  invalidateCache(['package-options:']);
  return response.data;
};

export const updatePackageOption = async (id, data) => {
  const response = await api.put(`/package-options/${id}`, data);
  invalidateCache(['package-options:']);
  return response.data;
};

export const deletePackageOption = async (id) => {
  const response = await api.delete(`/package-options/${id}`);
  invalidateCache(['package-options:']);
  return response.data;
};
