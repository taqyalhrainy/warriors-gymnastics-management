import { fetchPlayers } from './players.js';
import { fetchParents } from './parents.js';
import { fetchGroups } from './groups.js';
import { fetchTodayAttendance } from './attendance.js';
import { fetchWaitingList } from './waitingList.js';
import { fetchDashboard } from './reports.js';

let warmedForUserId = '';
let warmupPromise = null;
let warmedParentForUserId = '';
let parentWarmupPromise = null;

export const warmAdminAppCache = async (user) => {
  const userId = user?.id || user?._id || '';
  if (!userId || warmedForUserId === userId) {
    return;
  }

  if (warmupPromise) {
    return warmupPromise;
  }

  warmupPromise = (async () => {
    await Promise.allSettled([
      fetchDashboard(),
      fetchPlayers(),
      fetchParents(),
      fetchWaitingList(),
      fetchGroups(),
      fetchTodayAttendance()
    ]);

    warmedForUserId = userId;
  })();

  try {
    await warmupPromise;
  } finally {
    warmupPromise = null;
  }
};

export const warmParentAppCache = async (user) => {
  const userId = user?.id || user?._id || '';
  if (!userId || warmedParentForUserId === userId) {
    return;
  }

  if (parentWarmupPromise) {
    return parentWarmupPromise;
  }

  parentWarmupPromise = Promise.resolve().then(() => {
    warmedParentForUserId = userId;
  });

  try {
    await parentWarmupPromise;
  } finally {
    parentWarmupPromise = null;
  }
};

export const resetPrefetchState = () => {
  warmedForUserId = '';
  warmupPromise = null;
  warmedParentForUserId = '';
  parentWarmupPromise = null;
};
