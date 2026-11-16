import { fetchAttendanceBoard, fetchGroups } from './groups.js';
import { fetchPlayersPage, fetchPlayerAlertCandidates } from './players.js';
import { fetchParentsPage } from './parents.js';
import { fetchPackageOptions } from './packageOptions.js';
import { fetchCoaches } from './coaches.js';
import { fetchWaitingList } from './waitingList.js';
import { fetchPrograms } from './programs.js';
import { fetchDashboard } from './reports.js';
import { fetchNotifications, fetchSavedNotificationMessages } from './notifications.js';
import {
  fetchParentAttendance,
  fetchParentChildren,
  fetchParentDashboard,
  fetchParentPayments
} from './parents.js';
import { birthdayDay } from '../utils/birthdayAlerts.js';
import { fetchChatConversations, prefetchParentChat } from './chat.js';

const warmed = new Set();
let adminGeneration = 0;

const todayKey = () => birthdayDay();

const runQuietly = async (tasks) => {
  for (const task of tasks) {
    task().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
};

// Starting tasks 120 ms apart did not limit concurrency: slow requests kept
// stacking up and competing with the page being opened. Await each worker.
const runAdminTasks = async (tasks, generation) => {
  let next = 0;
  const worker = async () => {
    while (generation === adminGeneration && next < tasks.length) {
      const task = tasks[next++];
      try { await task(); } catch { /* Optional prefetch never blocks navigation. */ }
      if (generation === adminGeneration && next < tasks.length) await new Promise((resolve) => setTimeout(resolve, 120));
    }
  };
  await Promise.all([worker(), worker()]);
};

const firstPlayersPage = () => fetchPlayersPage({ page: 1, limit: 20, compact: true, status: 'all', groupId: 'all', subscription: 'all', search: '' });
const firstParentsPage = () => fetchParentsPage({ page: 1, limit: 20, compact: true, search: '' });

const primaryAdminRead = () => {
  const path = globalThis.window?.location?.pathname || '/admin';
  if (path === '/admin' || path === '/admin/') return fetchDashboard;
  if (path === '/attendance') return fetchAttendanceBoard;
  if (path === '/players') return firstPlayersPage;
  if (path === '/parents') return firstParentsPage;
  if (path === '/chat') return fetchChatConversations;
  if (path === '/groups') return fetchGroups;
  if (path === '/coaches') return fetchCoaches;
  return null;
};

const preloadAdminPages = (generation) => runAdminTasks([
  () => import('../pages/AdminDashboard.jsx'),
  () => import('../pages/Players.jsx'),
  () => import('../pages/PlayerForm.jsx'),
  () => import('../pages/Groups.jsx'),
  () => import('../pages/Attendance.jsx'),
  () => import('../pages/Coaches.jsx'),
  () => import('../pages/Payments.jsx'),
  () => import('../pages/Notifications.jsx'),
  () => import('../pages/Parents.jsx'),
  () => import('../pages/Reports.jsx'),
  () => import('../pages/History.jsx'),
  () => import('../pages/AuditLogs.jsx'),
  () => import('../pages/ClubMedia.jsx')
], generation);

const preloadParentPages = () => runQuietly([
  () => import('../pages/ParentDashboard.jsx'),
  () => import('../pages/ParentAttendance.jsx'),
  () => import('../pages/ParentPayments.jsx'),
  () => import('../pages/ParentNotifications.jsx'),
  () => import('../pages/ParentSettings.jsx'),
  () => import('../pages/ParentChildren.jsx'),
  () => import('../pages/ParentSubscriptionSummary.jsx')
]);

export const warmAdminAppCache = async (user = {}) => {
  const key = `admin:${user.id || user._id || 'session'}:${todayKey()}`;
  if (warmed.has(key)) return;
  warmed.add(key);
  const generation = adminGeneration;
  const primary = primaryAdminRead();
  // Reuse the active screen's cached/in-flight read before warming other screens.
  // If the server is unavailable, do not add another queue of retrying requests.
  try { if (primary) await primary(); }
  catch { if (generation === adminGeneration) warmed.delete(key); return; }
  if (generation !== adminGeneration) return;

  await runAdminTasks([
    () => fetchChatConversations(),
    () => import('../pages/ClubChat.jsx'),
    () => fetchGroups(),
    firstPlayersPage,
    firstParentsPage,
    () => fetchPackageOptions(),
    () => fetchCoaches(),
    () => fetchDashboard(),
    () => fetchPlayerAlertCandidates(),
    () => fetchNotifications({ date: todayKey(), page: 1, limit: 20 }),
    () => fetchWaitingList(),
    () => fetchPrograms(),
    () => fetchSavedNotificationMessages(),
  ], generation);
  if (generation === adminGeneration) await preloadAdminPages(generation);
};

export const warmParentAppCache = async (user = {}) => {
  const key = `parent:${user.id || user._id || 'session'}:${todayKey()}`;
  if (warmed.has(key)) return;
  warmed.add(key);

  await runQuietly([
    () => prefetchParentChat(user),
    () => import('../pages/ParentChat.jsx'),
    () => fetchParentDashboard(),
    () => fetchParentChildren(),
    () => fetchParentAttendance(),
    () => fetchParentPayments({ page: 1, limit: 20 }),
    () => fetchNotifications({ page: 1, limit: 20 }),
    () => preloadParentPages()
  ]);
};

export const resetPrefetchState = () => {
  adminGeneration += 1;
  warmed.clear();
};
