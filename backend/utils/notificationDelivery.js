const Notification = require('../models/Notification');
const { sendPushToUser } = require('./pushNotifications');
const { sendNativePushToUser } = require('./nativePushNotifications');

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
  const payload = {
    title: notification.title,
    body: notification.message,
    notificationId: id,
    type: notification.type,
    url: safeInternalUrl(notification.url, notification.type, id)
  };

  return Promise.allSettled([
    sendPushToUser(notification.recipientUserId, payload),
    sendNativePushToUser(notification.recipientUserId, payload)
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error('Push side effect failed:', result.reason?.message || result.reason);
      }
    });
  });
};

const createNotification = async (data) => {
  const notification = await Notification.create(data);
  await pushNotification(notification);
  return notification;
};

const createNotifications = async (items) => {
  if (!items.length) return [];
  const notifications = await Notification.insertMany(items);
  await Promise.all(notifications.map(pushNotification));
  return notifications;
};

module.exports = {
  createNotification,
  createNotifications,
  pushNotification
};
