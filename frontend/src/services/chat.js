import api from './api.js';
import { fetchCached, getCachedValue, invalidateCache, setCached } from './cache.js';

export const notifyChatChanged = ({ preserveMessages = false } = {}) => {
  invalidateCache(preserveMessages ? ['chat:conversations:', 'chat:unread-count'] : ['chat:']);
  window.dispatchEvent(new Event('chat:changed'));
};

const conversationParams = (params = {}) => ({
  search: String(params.search || '').trim(),
  ...(params.beforeAt && params.beforeId ? { beforeAt: params.beforeAt, beforeId: params.beforeId } : {})
});
const conversationKey = (params) => `chat:conversations:${JSON.stringify(conversationParams(params))}`;

export const getCachedChatConversations = (params = {}) => getCachedValue(conversationKey(params));

export const fetchChatConversations = (params = {}, options = {}) => fetchCached(conversationKey(params), async () => {
  // This request is shared by startup prefetch and the chat screen. Cancelling
  // a screen must not cancel the data another consumer is waiting for.
  const { data } = await api.get('/chat/conversations', { params: conversationParams(params), __skipRetry: true });
  return data;
}, { ttlMs: 30000, force: Boolean(options.force) });

export const fetchChatUnreadCount = () => fetchCached('chat:unread-count', async () => {
  const { data } = await api.get('/chat/unread-count', { __skipRetry: true });
  return data;
}, { ttlMs: 10000 });

export const mergeChatConversations = (current, incoming) => {
  const byId = new Map(current.map((item) => [item._id, item]));
  incoming.forEach((item) => {
    const previous = byId.get(item._id);
    if (!previous || new Date(item.lastMessage.createdAt) >= new Date(previous.lastMessage.createdAt)) byId.set(item._id, item);
  });
  return [...byId.values()].sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt) || b._id.localeCompare(a._id));
};
const messageParams = (params = {}) => ({
  ...(params.date ? { date: params.date } : {}),
  ...(params.beforeAt && params.beforeId ? { beforeAt: params.beforeAt, beforeId: params.beforeId } : {})
});
const messageKey = (parentUserId, params = {}) => `chat:messages:${parentUserId}:${JSON.stringify(messageParams(params))}`;
// Keep the last confirmed thread visible for this login session while refreshing.
// clearCache() discards it on logout; no private messages go into persistent storage.
export const getCachedChatMessages = (parentUserId, params = {}) => getCachedValue(messageKey(parentUserId, params), { ttlMs: Infinity });

export const fetchChatMessages = (parentUserId, params = {}, options = {}) => fetchCached(messageKey(parentUserId, params), async () => {
  // Startup and the open thread share this request; only an open thread marks it read.
  const { data } = await api.get(`/chat/${parentUserId}/messages`, { params: messageParams(params), __skipRetry: true });
  return data;
}, { ttlMs: 15000, force: Boolean(options.force) });

export const prefetchParentChat = (user = {}) => {
  const id = user.id || user._id;
  return id ? fetchChatMessages(id) : Promise.resolve();
};
export const sendChatMessage = async (parentUserId, text, clientMessageId) => {
  const { data } = await api.post(`/chat/${parentUserId}/messages`, { text, clientMessageId });
  const cached = getCachedChatMessages(parentUserId);
  notifyChatChanged();
  if (cached) {
    const items = [...new Map([...cached.items, data].map((item) => [item.key, item])).values()]
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id)));
    setCached(messageKey(parentUserId), { ...cached, items });
  }
  return data;
};
export const markChatRead = async (parentUserId, items) => {
  const messageIds = items.filter((item) => item.kind === 'message').map((item) => item._id);
  const responses = items.filter((item) => item.kind === 'notification-response')
    .map((item) => ({ _id: item._id, updatedAt: item.createdAt }));
  if (!messageIds.length && !responses.length) return;
  await api.post(`/chat/${parentUserId}/read`, { messageIds, responses });
  notifyChatChanged({ preserveMessages: true });
};
