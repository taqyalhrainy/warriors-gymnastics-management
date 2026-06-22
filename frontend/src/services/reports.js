import api from './api.js';

export const fetchDashboard = async () => {
  const response = await api.get('/reports/dashboard');
  return response.data;
};

export const fetchRevenue = async () => {
  const response = await api.get('/reports/revenue');
  return response.data;
};

export const fetchAttendanceReport = async () => {
  const response = await api.get('/reports/attendance');
  return response.data;
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
