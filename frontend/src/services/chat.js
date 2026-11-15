import api from './api.js';

export const notifyChatChanged = () => window.dispatchEvent(new Event('chat:changed'));

export const fetchChatConversations = async (signal) => {
  const { data } = await api.get('/chat/conversations', { signal, __skipRetry: true });
  return data;
};
export const fetchChatUnreadCount = async (signal) => {
  const { data } = await api.get('/chat/unread-count', { signal, __skipRetry: true });
  return data;
};
export const fetchChatMessages = async (parentUserId, params = {}, signal) => {
  const { data } = await api.get(`/chat/${parentUserId}/messages`, { params, signal, __skipRetry: true });
  return data;
};
export const sendChatMessage = async (parentUserId, text, clientMessageId) => {
  const { data } = await api.post(`/chat/${parentUserId}/messages`, { text, clientMessageId });
  notifyChatChanged();
  return data;
};
export const markChatRead = async (parentUserId, items) => {
  const messageIds = items.filter((item) => item.kind === 'message').map((item) => item._id);
  const responses = items.filter((item) => item.kind === 'notification-response')
    .map((item) => ({ _id: item._id, updatedAt: item.createdAt }));
  if (!messageIds.length && !responses.length) return;
  await api.post(`/chat/${parentUserId}/read`, { messageIds, responses });
  notifyChatChanged();
};
