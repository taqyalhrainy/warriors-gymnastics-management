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
