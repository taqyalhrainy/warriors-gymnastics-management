const Notification = require('../models/Notification');
const { sendPushToUser } = require('./pushNotifications');

const safeInternalUrl = (url, type, id) => {
  const fallback = id ? `/parent/notifications/${id}` : '/parent/notifications';
  const value = String(url || '').trim();
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  if (type === 'payment') return '/parent/payments';
  if (type === 'attendance') return '/parent/attendance';
  return fallback;
};

const pushNotification = (notification) => {
  const id = notification._id;
  return sendPushToUser(notification.recipientUserId, {
    title: notification.title,
    body: notification.message,
    notificationId: id,
    type: notification.type,
    url: safeInternalUrl(notification.url, notification.type, id)
  }).catch((error) => console.error('Push side effect failed:', error.message));
};

const createNotification = async (data) => {
  const notification = await Notification.create(data);
  pushNotification(notification);
  return notification;
};

const createNotifications = async (items) => {
  if (!items.length) return [];
  const notifications = await Notification.insertMany(items);
  notifications.forEach(pushNotification);
  return notifications;
};

module.exports = {
  createNotification,
  createNotifications,
  pushNotification
};
