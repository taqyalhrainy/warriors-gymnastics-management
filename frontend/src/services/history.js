import api from './api.js';

export const fetchHistorySnapshot = async ({ entityType, at }) => {
  const response = await api.get('/history', {
    params: { entityType, at }
  });

  return response.data;
};

export const fetchPlayerHistory = async (playerId) => {
  const response = await api.get(`/history/player/${playerId}`);
  return response.data;
};

export const restoreHistorySnapshot = async ({ at }) => {
  const response = await api.post('/history/restore', {
    at,
    confirm: 'RESTORE'
  }, {
    timeout: 180000,
    __allowWhenNetworkBlocked: true,
    __skipNetworkStatus: true
  });

  return response.data;
};

export const fetchSnapshotRestoreStatus = async (jobId) => {
  const response = await api.get(`/history/restore/${jobId}`, {
    timeout: 30000,
    __skipRetry: true,
    __skipNetworkStatus: true
  });

  return response.data;
};
