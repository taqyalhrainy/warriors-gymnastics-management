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
