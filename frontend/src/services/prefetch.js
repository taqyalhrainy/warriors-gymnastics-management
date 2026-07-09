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
let backgroundWarmupForUserId = '';

const startBackgroundWarmup = (userId, groups = []) => {
  if (!userId || backgroundWarmupForUserId === userId) {
    return;
  }

  backgroundWarmupForUserId = userId;

  setTimeout(() => {
    const groupPlayersPromise = (async () => {
      const availableGroups = groups.length ? groups : await fetchGroups();
      await Promise.allSettled(availableGroups.map((group) => fetchGroupPlayers(group._id)));
    })();

    Promise.allSettled([
      fetchPayments(),
      fetchSubscriptions(),
      fetchPrograms(),
      fetchCoaches(),
      fetchPackageOptions(),
      fetchNotifications(),
      groupPlayersPromise
    ]).then((results) => {
      results
        .filter((result) => result.status === 'rejected')
        .forEach((result) => console.warn('Background prefetch failed:', result.reason));
    });
  }, 0);
};

export const warmAdminAppCache = async (user) => {
  const userId = user?.id || user?._id || '';
  if (!userId || warmedForUserId === userId) {
    return;
  }

  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = (async () => {
    const results = await Promise.all([
      fetchDashboard(),
      fetchPlayers(),
      fetchParents(),
      fetchWaitingList(),
      fetchGroups(),
      fetchTodayAttendance()
    ]);

    const groups = results[4] || [];
    warmedForUserId = userId;
    startBackgroundWarmup(userId, groups);
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
  backgroundWarmupForUserId = '';
};
