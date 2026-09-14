import { fetchAttendanceBoard, fetchGroups } from './groups.js';
import { fetchPlayers, fetchPlayersPage, fetchPlayerAlertCandidates } from './players.js';
import { fetchParentsCompact, fetchParentsPage } from './parents.js';
import { fetchPackageOptions } from './packageOptions.js';
import { fetchCoaches } from './coaches.js';
import { fetchWaitingList } from './waitingList.js';
import { fetchPayments } from './payments.js';
import { fetchSubscriptions } from './subscriptions.js';
import { fetchPrograms } from './programs.js';
import { fetchAdminClubMedia } from './clubMedia.js';
import { fetchAttendanceReport, fetchDashboard, fetchRevenue } from './reports.js';
import { fetchNotifications, fetchSavedNotificationMessages } from './notifications.js';
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

const preloadAdminPages = () => runQuietly([
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
]);

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

  await runQuietly([
    () => fetchGroups(),
    () => fetchPlayersPage({ page: 1, limit: 20, compact: true, status: 'all', groupId: 'all', subscription: 'all', search: '' }),
    () => fetchParentsPage({ page: 1, limit: 20, compact: true, search: '' }),
    () => fetchPackageOptions(),
    () => fetchCoaches(),
    () => fetchDashboard(),
    () => fetchPlayerAlertCandidates(),
    () => fetchNotifications({ date: todayKey(), page: 1, limit: 20 }),
    () => fetchAttendanceBoard(),
    () => fetchWaitingList(),
    () => fetchPayments(),
    () => fetchSubscriptions(),
    () => fetchPrograms(),
    () => fetchSavedNotificationMessages(),
    () => fetchAdminClubMedia(),
    () => fetchRevenue(),
    () => fetchAttendanceReport(),
    () => fetchPlayersPage({ page: 2, limit: 20, compact: true, status: 'all', groupId: 'all', subscription: 'all', search: '' }),
    () => fetchParentsPage({ page: 2, limit: 20, compact: true, search: '' }),
    () => fetchPlayers({ compact: true }),
    () => fetchParentsCompact(),
    () => preloadAdminPages()
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
    () => fetchParentPayments({ page: 1, limit: 20 }),
    () => fetchNotifications({ page: 1, limit: 20 }),
    () => preloadParentPages()
  ]);
};

export const resetPrefetchState = () => {
  warmed.clear();
};
