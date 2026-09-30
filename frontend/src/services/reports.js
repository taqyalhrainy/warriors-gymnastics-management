import api from './api.js';
import { fetchCached } from './cache.js';

export const fetchDashboard = async (options = {}) => {
  return fetchCached('reports:dashboard', async () => {
    const response = await api.get('/reports/dashboard');
    return response.data;
  }, { ttlMs: 60 * 1000, force: Boolean(options.force) });
};

export const fetchRevenue = async (options = {}) => {
  return fetchCached('reports:revenue', async () => {
    const response = await api.get('/reports/revenue');
    return response.data;
  }, { ttlMs: 60 * 1000, force: Boolean(options.force) });
};

export const fetchAttendanceReport = async () => {
  return fetchCached('reports:attendance', async () => {
    const response = await api.get('/reports/attendance');
    return response.data;
  }, { ttlMs: 60 * 1000 });
};

export const downloadPlayersBackup = async () => {
  const response = await api.get('/reports/players-backup', { responseType: 'blob' });
  const disposition = response.headers['content-disposition'] || '';
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
  return {
    blob: response.data,
    filename: filenameMatch?.[1] || `Warriors-Players-Backup-${new Date().toISOString().split('T')[0]}.xlsx`
  };
};
