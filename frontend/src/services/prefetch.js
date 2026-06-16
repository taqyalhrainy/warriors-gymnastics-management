import { fetchPlayers } from './players.js';
import { fetchParents } from './parents.js';
import { fetchGroups } from './groups.js';
import { fetchPayments } from './payments.js';
import { fetchPrograms } from './programs.js';
import { fetchCoaches } from './coaches.js';
import { fetchNotifications } from './notifications.js';

let warmedForUserId = '';

export const warmAdminAppCache = async (user) => {
  const userId = user?.id || user?._id || '';
  if (!userId || warmedForUserId === userId) {
    return;
  }

  warmedForUserId = userId;

  await Promise.allSettled([
    fetchPlayers(),
    fetchParents(),
    fetchGroups(),
    fetchPayments(),
    fetchPrograms(),
    fetchCoaches(),
    fetchNotifications()
  ]);
};

export const resetPrefetchState = () => {
  warmedForUserId = '';
};
