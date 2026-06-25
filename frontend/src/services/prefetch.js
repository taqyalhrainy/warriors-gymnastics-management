import { fetchPlayers } from './players.js';
import { fetchParents } from './parents.js';
import { fetchGroups } from './groups.js';
import { fetchGroupPlayers } from './groups.js';
import { fetchPayments } from './payments.js';
import { fetchPrograms } from './programs.js';
import { fetchCoaches } from './coaches.js';
import { fetchNotifications } from './notifications.js';
import { fetchTodayAttendance } from './attendance.js';

let warmedForUserId = '';

export const warmAdminAppCache = async (user) => {
  const userId = user?.id || user?._id || '';
  if (!userId || warmedForUserId === userId) {
    return;
  }

  warmedForUserId = userId;

  const groupsPromise = fetchGroups();

  await Promise.allSettled([
    fetchPlayers(),
    fetchParents(),
    groupsPromise,
    fetchPayments(),
    fetchPrograms(),
    fetchCoaches(),
    fetchNotifications(),
    fetchTodayAttendance()
  ]);

  groupsPromise
    .then((groups) => Promise.allSettled(groups.map((group) => fetchGroupPlayers(group._id))))
    .catch(() => {});
};

export const resetPrefetchState = () => {
  warmedForUserId = '';
};
