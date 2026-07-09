import { fetchPlayers } from './players.js';
import { fetchParents } from './parents.js';
import { fetchGroups } from './groups.js';
import { fetchGroupPlayers } from './groups.js';
import { fetchPayments } from './payments.js';
import { fetchPrograms } from './programs.js';
import { fetchCoaches } from './coaches.js';
import { fetchNotifications } from './notifications.js';
import { fetchTodayAttendance } from './attendance.js';
import { fetchPackageOptions } from './packageOptions.js';
import { fetchSubscriptions } from './subscriptions.js';
import { fetchWaitingList } from './waitingList.js';
import { fetchDashboard } from './reports.js';

let warmedForUserId = '';
let warmupPromise = null;

export const warmAdminAppCache = async (user) => {
  const userId = user?.id || user?._id || '';
  if (!userId || warmedForUserId === userId) {
    return;
  }

  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = (async () => {
    const groupsPromise = fetchGroups();
    const playersPromise = fetchPlayers();

    const results = await Promise.all([
      fetchDashboard(),
      playersPromise,
      fetchParents(),
      groupsPromise,
      fetchPayments(),
      fetchSubscriptions(),
      fetchPrograms(),
      fetchCoaches(),
      fetchPackageOptions(),
      fetchWaitingList(),
      fetchNotifications(),
      fetchTodayAttendance()
    ]);

    const groups = results[3] || [];
    await Promise.all(groups.map((group) => fetchGroupPlayers(group._id)));
    warmedForUserId = userId;
  })();

  try {
    await warmupPromise;
  } finally {
    warmupPromise = null;
  }
};

export const resetPrefetchState = () => {
  warmedForUserId = '';
  warmupPromise = null;
};
