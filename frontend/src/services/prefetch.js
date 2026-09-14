import { fetchAttendanceBoard, fetchGroups } from './groups.js';
import { fetchPlayersPage, fetchPlayerAlertCandidates } from './players.js';
import { fetchParentsPage } from './parents.js';
import { fetchPackageOptions } from './packageOptions.js';
import { fetchCoaches } from './coaches.js';
import { fetchWaitingList } from './waitingList.js';
import { fetchDashboard } from './reports.js';
import { fetchNotifications } from './notifications.js';
import {
  fetchParentAttendance,
  fetchParentChildren,
  fetchParentDashboard,
  fetchParentPayments
} from './parents.js';

const warmed = new Set();

const todayKey = () => new Date().toISOString().split('T')[0];

const runQuietly = async (tasks) => {
  for (const task of tasks) {
    task().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
};

export const warmAdminAppCache = async (user = {}) => {
  const key = `admin:${user.id || user._id || 'session'}:${todayKey()}`;
  if (warmed.has(key)) return;
  warmed.add(key);

  await runQuietly([
    () => fetchGroups(),
    () => fetchPlayersPage({ page: 1, limit: 20 }),
    () => fetchParentsPage({ page: 1, limit: 20 }),
    () => fetchPackageOptions(),
    () => fetchCoaches(),
    () => fetchDashboard(),
    () => fetchPlayerAlertCandidates(),
    () => fetchNotifications({ date: todayKey() }),
    () => fetchAttendanceBoard(),
    () => fetchWaitingList()
  ]);
};

export const warmParentAppCache = async (user = {}) => {
  const key = `parent:${user.id || user._id || 'session'}:${todayKey()}`;
  if (warmed.has(key)) return;
  warmed.add(key);

  await runQuietly([
    () => fetchParentDashboard(),
    () => fetchParentChildren(),
    () => fetchParentAttendance(),
    () => fetchParentPayments(),
    () => fetchNotifications()
  ]);
};

export const resetPrefetchState = () => {
  warmed.clear();
};
