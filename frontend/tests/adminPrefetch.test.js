import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';

const settle = () => new Promise(setImmediate);
const setup = async (path = '/admin') => {
  const requests = [], active = new Set();
  let peak = 0;
  const call = (name) => () => {
    requests.push(name);
    return new Promise((resolve, reject) => {
      const entry = { name, resolve: () => { active.delete(entry); resolve([]); }, reject: () => { active.delete(entry); reject(new Error('offline')); } };
      active.add(entry); peak = Math.max(peak, active.size);
    });
  };
  const exports = (names) => Object.fromEntries(names.map((name) => [name, call(name)]));
  const api = await load('../src/services/prefetch.js', {
    './groups.js': exports(['fetchAttendanceBoard', 'fetchGroups']),
    './players.js': exports(['fetchPlayersPage', 'fetchPlayerAlertCandidates']),
    './parents.js': exports(['fetchParentsPage', 'fetchParentAttendance', 'fetchParentChildren', 'fetchParentDashboard', 'fetchParentPayments']),
    './packageOptions.js': exports(['fetchPackageOptions']), './coaches.js': exports(['fetchCoaches']),
    './waitingList.js': exports(['fetchWaitingList']), './programs.js': exports(['fetchPrograms']),
    './reports.js': exports(['fetchDashboard']), './notifications.js': exports(['fetchNotifications', 'fetchSavedNotificationMessages']),
    '../utils/birthdayAlerts.js': { birthdayDay: () => '2026-11-16' },
    './chat.js': exports(['fetchChatConversations', 'prefetchParentChat'])
  }, { window: { location: { pathname: path } }, setTimeout: (callback) => { queueMicrotask(callback); }, Promise });
  return { api, requests, active, get peak() { return peak; } };
};

test('admin startup waits for the displayed dashboard and limits optional reads to two', async () => {
  const env = await setup();
  const warming = env.api.warmAdminAppCache({ id: 'admin' });
  assert.deepEqual(env.requests, ['fetchDashboard']);
  [...env.active][0].resolve();
  await settle();
  assert.ok(env.requests.includes('fetchChatConversations'), 'the first ten chats still warm at startup');
  for (let i = 0; i < 30; i++) { [...env.active].forEach((entry) => entry.resolve()); await settle(); }
  await warming;
  assert.ok(env.peak <= 2);
  assert.equal(env.requests.includes('fetchAttendanceBoard'), false, 'do not load the whole attendance board on the dashboard');
  assert.equal(env.requests.includes('fetchPlayers'), false);
  assert.equal(env.requests.includes('fetchPayments'), false);
  assert.equal(env.requests.includes('fetchRevenue'), false);
});

test('opening attendance prioritizes its board before any other background read', async () => {
  const env = await setup('/attendance');
  const warming = env.api.warmAdminAppCache({ id: 'admin' });
  assert.deepEqual(env.requests, ['fetchAttendanceBoard']);
  env.api.resetPrefetchState();
  [...env.active][0].resolve();
  await warming;
  assert.deepEqual(env.requests, ['fetchAttendanceBoard']);
});

test('server failure does not launch a backlog of optional reads', async () => {
  const env = await setup();
  const warming = env.api.warmAdminAppCache({ id: 'admin' });
  [...env.active][0].reject();
  await warming;
  assert.deepEqual(env.requests, ['fetchDashboard']);
});

test('logout cancels queued admin prefetch work after active requests settle', async () => {
  const env = await setup();
  const warming = env.api.warmAdminAppCache({ id: 'admin' });
  [...env.active][0].resolve(); await settle();
  const count = env.requests.length;
  env.api.resetPrefetchState();
  [...env.active].forEach((entry) => entry.resolve());
  await warming;
  assert.equal(env.requests.length, count);
});
