import { fetchNotifications } from './notifications.js';
import {
  fetchParentAttendance,
  fetchParentChildren,
  fetchParentDashboard,
  fetchParentPayments
} from './parents.js';
import { birthdayDay } from '../utils/birthdayAlerts.js';

const warmed = new Set();
const todayKey = () => birthdayDay();

const runQuietly = async (tasks) => {
  for (const task of tasks) {
    task().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
};

const preloadParentPages = () => runQuietly([
  () => import('../pages/ParentDashboard.jsx'),
  () => import('../pages/ParentAttendance.jsx'),
  () => import('../pages/ParentPayments.jsx'),
  () => import('../pages/ParentNotifications.jsx'),
  () => import('../pages/ParentSettings.jsx'),
  () => import('../pages/ParentChildren.jsx'),
  () => import('../pages/ParentSubscriptionSummary.jsx'),
  () => import('../pages/ParentNotificationDetail.jsx')
]);

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
