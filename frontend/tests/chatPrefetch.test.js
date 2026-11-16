import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';
import * as cache from '../src/services/cache.js';

const setup = async (api) => {
  cache.clearCache();
  return load('../src/services/chat.js', { './api.js': { default: api }, './cache.js': cache }, {
    window: { dispatchEvent() {} }, Event: class {}
  });
};

test('startup prefetch and opening chat share one request and a ready first page', async () => {
  let resolve, reads = 0;
  const api = { get: async () => { reads++; return new Promise((done) => { resolve = done; }); } };
  const chat = await setup(api);
  const prefetch = chat.fetchChatConversations();
  const screen = chat.fetchChatConversations();
  assert.equal(reads, 1);
  const page = { items: [{ _id: 'parent' }], cursor: null, hasMore: false };
  resolve({ data: page });
  assert.equal(await prefetch, page);
  assert.equal(await screen, page);
  assert.equal(chat.getCachedChatConversations(), page);
  assert.equal(await chat.fetchChatConversations(), page);
  assert.equal(reads, 1);
});

test('View more and search keep independent cached pages', async () => {
  const queries = [];
  const chat = await setup({ get: async (url, options) => {
    queries.push({ ...options.params });
    return { data: { items: [{ _id: options.params.beforeId || options.params.search || 'first' }] } };
  } });
  await chat.fetchChatConversations();
  const cursor = { beforeAt: '2026-11-15T10:00:00Z', beforeId: 'older' };
  await chat.fetchChatConversations(cursor);
  await chat.fetchChatConversations({ search: '  Parent  ' });
  assert.equal(chat.getCachedChatConversations().items[0]._id, 'first');
  assert.equal(chat.getCachedChatConversations(cursor).items[0]._id, 'older');
  assert.equal(chat.getCachedChatConversations({ search: 'Parent' }).items[0]._id, 'Parent');
  assert.equal(queries.length, 3);
});

test('chat mutations refresh prefetched data and duplicate badge requests share their result', async () => {
  let reads = 0;
  const chat = await setup({ get: async () => ({ data: { count: ++reads, items: [] } }) });
  const [one, two] = await Promise.all([chat.fetchChatUnreadCount(), chat.fetchChatUnreadCount()]);
  assert.equal(one, two);
  assert.equal(reads, 1);
  await chat.fetchChatConversations();
  chat.notifyChatChanged();
  assert.equal(chat.getCachedChatConversations(), undefined);
  await chat.fetchChatUnreadCount();
  assert.equal(reads, 3);
});

test('a prefetched inbox from a logged-out account never enters the next session', async () => {
  let resolve;
  const chat = await setup({ get: () => new Promise((done) => { resolve = done; }) });
  const pending = chat.fetchChatConversations();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  cache.clearCache();
  resolve({ data: { items: [{ _id: 'old-account' }] } });
  await rejected;
  assert.equal(chat.getCachedChatConversations(), undefined);
});

test('pagination merges retain refreshed conversations and add ten more without duplicates', async () => {
  const chat = await setup({});
  const row = (id, time = '2026-11-15T10:00:00Z') => ({ _id: String(id), lastMessage: { createdAt: time } });
  const first = Array.from({ length: 10 }, (_, index) => row(index));
  const second = Array.from({ length: 10 }, (_, index) => row(index + 10));
  const merged = chat.mergeChatConversations(first, second);
  assert.equal(merged.length, 20);
  const updated = chat.mergeChatConversations(merged, [row(15, '2026-11-15T12:00:00Z')]);
  const withOldPage = chat.mergeChatConversations(updated, second);
  assert.equal(withOldPage.length, 20);
  assert.equal(withOldPage[0]._id, '15');
  assert.equal(withOldPage[0].lastMessage.createdAt, '2026-11-15T12:00:00Z');
});

test('parent startup shares the thread request and never marks unread messages read', async () => {
  let resolve, reads = 0, writes = 0;
  const chat = await setup({ get: () => { reads++; return new Promise((done) => { resolve = done; }); }, post: () => { writes++; } });
  const warming = chat.prefetchParentChat({ id: 'parent' });
  const opening = chat.fetchChatMessages('parent');
  const page = { parent: { name: 'Parent' }, items: [{ key: 'message-1', readAt: null }], cursor: null };
  resolve({ data: page });
  assert.equal(await warming, page);
  assert.equal(await opening, page);
  assert.equal(chat.getCachedChatMessages('parent'), page);
  assert.equal(chat.getCachedChatMessages('other-parent'), undefined);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test('marking a thread read preserves ready messages while invalidating inbox badges', async () => {
  const writes = [];
  const page = { parent: { name: 'Parent' }, items: [{ _id: 'one', key: 'message-one', kind: 'message' }] };
  const chat = await setup({ get: async () => ({ data: page }), post: async (url) => { writes.push(url); } });
  await chat.prefetchParentChat({ id: 'parent' });
  await chat.fetchChatConversations();
  await chat.markChatRead('parent', page.items);
  assert.equal(chat.getCachedChatMessages('parent'), page);
  assert.equal(chat.getCachedChatConversations(), undefined);
  assert.deepEqual(writes, ['/chat/parent/read']);
});

test('sending preserves a ready thread and an older pending read cannot remove the saved message', async () => {
  let finishRead;
  const old = { _id: 'one', key: 'message-one', createdAt: '2026-11-15T10:00:00Z' };
  const saved = { _id: 'two', key: 'message-two', createdAt: '2026-11-15T11:00:00Z', text: 'Hello' };
  const page = { parent: { name: 'Parent' }, items: [old], cursor: null };
  let reads = 0;
  const chat = await setup({
    get: () => ++reads === 1 ? Promise.resolve({ data: page }) : new Promise((done) => { finishRead = done; }),
    post: async () => ({ data: saved })
  });
  await chat.prefetchParentChat({ id: 'parent' });
  const stale = chat.fetchChatMessages('parent', {}, { force: true });
  await chat.sendChatMessage('parent', 'Hello', 'unique-send');
  finishRead({ data: page });
  assert.equal((await stale).items.length, 2);
  assert.equal(chat.getCachedChatMessages('parent').items[1].text, 'Hello');
});

test('thread day filters, pagination and background refresh use separate cache entries', async () => {
  let reads = 0;
  const chat = await setup({ get: async () => ({ data: { items: [], version: ++reads } }) });
  const first = await chat.fetchChatMessages('parent');
  await chat.fetchChatMessages('parent', { date: '2026-11-15' });
  await chat.fetchChatMessages('parent', { beforeAt: '2026-11-15T10:00:00Z', beforeId: 'old' });
  assert.equal(chat.getCachedChatMessages('parent'), first);
  assert.equal(reads, 3);
  const fresh = await chat.fetchChatMessages('parent', {}, { force: true });
  assert.equal(fresh.version, 4);
  assert.equal(chat.getCachedChatMessages('parent'), fresh);
});

test('logout discards an in-flight parent thread and clears previously cached messages', async () => {
  let resolve;
  const chat = await setup({ get: () => new Promise((done) => { resolve = done; }) });
  const warming = chat.prefetchParentChat({ id: 'parent' });
  const rejected = assert.rejects(warming, { name: 'AbortError' });
  cache.clearCache();
  resolve({ data: { items: [{ text: 'Private' }] } });
  await rejected;
  assert.equal(chat.getCachedChatMessages('parent'), undefined);
});

test('deletion keeps a warm thread and an in-flight read cannot resurrect text or media', async () => {
  let resolve;
  const old = { _id: 'one', key: 'message-one', kind: 'message', text: 'Private', attachment: { kind: 'image' }, createdAt: '2026-11-16T08:00:00Z' };
  const removed = { ...old, text: 'This message was deleted.', attachment: undefined, deletedAt: '2026-11-16T09:00:00Z' };
  let reads = 0;
  const chat = await setup({ get: () => ++reads === 1 ? Promise.resolve({ data: { parent: { name: 'Parent' }, items: [old] } }) : new Promise((done) => { resolve = done; }), delete: async () => ({ data: removed }) });
  await chat.fetchChatMessages('parent');
  const pending = chat.fetchChatMessages('parent', {}, { force: true });
  await chat.deleteChatMessage('parent', old);
  resolve({ data: { items: [old] } });
  assert.ok((await pending).items[0].deletedAt);
  const cached = chat.getCachedChatMessages('parent').items;
  assert.equal(cached[0].attachment, undefined);
  assert.equal(chat.mergeChatMessages(cached, [old])[0].text, 'This message was deleted.');
});

test('loaded older pages apply remote deletions while preserving message date and ordering', async () => {
  const chat = await setup({});
  const old = { _id: 'one', key: 'notification-response-one', text: 'Reply', reaction: 'reaction', createdAt: '2026-11-16T08:00:00Z' };
  const updated = chat.applyChatDeletions([old], [{ key: old.key, deletedAt: '2026-11-16T10:00:00Z' }]);
  assert.equal(updated[0].createdAt, old.createdAt);
  assert.equal(updated[0].reaction, undefined);
  assert.ok(updated[0].deletedAt);
  assert.ok(chat.mergeChatMessages([old], updated)[0].deletedAt);
});

test('inbox pagination cannot replace a deleted preview with an older cached original', async () => {
  const chat = await setup({});
  const old = { _id: 'parent', lastMessage: { _id: 'one', text: 'Private', createdAt: '2026-11-16T08:00:00Z' } };
  const deleted = { ...old, lastMessage: { ...old.lastMessage, text: 'This message was deleted.', deletedAt: '2026-11-16T09:00:00Z' } };
  assert.ok(chat.mergeChatConversations([deleted], [old])[0].lastMessage.deletedAt);
});
