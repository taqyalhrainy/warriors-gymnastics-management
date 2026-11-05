const Notification = require('../models/Notification');
const NativePushToken = require('../models/NativePushToken');
const { sendPushToUser } = require('./pushNotifications');
const { sendNativePushToUser } = require('./nativePushNotifications');
const {
  createNotificationAttachment,
  deleteNotificationAttachment
} = require('./notificationAttachments');

const safeInternalUrl = (url, type, id) => {
  const fallback = id ? `/parent/notifications/${id}` : '/parent/notifications';
  const value = String(url || '').trim();
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  if (type === 'payment') return '/parent/payments';
  if (type === 'attendance') return '/parent/attendance';
  return fallback;
};

const pushNotification = async (notification) => {
  const id = notification._id;
  const payload = {
    title: notification.title,
    body: notification.message,
    notificationId: id,
    type: notification.type,
    url: safeInternalUrl(notification.url, notification.type, id)
  };

  let hasCurrentNativeAndroid = false;
  try {
    hasCurrentNativeAndroid = Boolean(await NativePushToken.exists({
      userId: notification.recipientUserId,
      platform: 'android',
      transportVersion: 2
    }));
  } catch (error) {
    console.error('Unable to check native Android push registration:', error?.message || error);
  }

  return Promise.allSettled([
    sendPushToUser(notification.recipientUserId, payload, { excludeAndroid: hasCurrentNativeAndroid }),
    sendNativePushToUser(notification.recipientUserId, payload)
  ]).then((results) => {
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error('Push side effect failed:', result.reason?.message || result.reason);
      }
    });
  });
};

const createNotification = async (data, { waitForPush = true, attachment, createdBy } = {}) => {
  const attachmentRecord = await createNotificationAttachment(attachment, createdBy);
  let notification;
  try {
    notification = await Notification.create({
      ...data,
      ...(attachmentRecord && { attachmentId: attachmentRecord._id })
    });
  } catch (error) {
    await deleteNotificationAttachment(attachmentRecord?._id).catch(() => {});
    throw error;
  }
  const delivery = pushNotification(notification);
  if (waitForPush) await delivery;
  else delivery.catch((error) => console.error('Push delivery failed:', error.message));
  return notification;
};

const createNotifications = async (items, { attachment, createdBy } = {}) => {
  if (!items.length) return [];
  const attachmentRecord = await createNotificationAttachment(attachment, createdBy);
  let notifications;
  try {
    notifications = await Notification.insertMany(items.map((item) => ({
      ...item,
      ...(attachmentRecord && { attachmentId: attachmentRecord._id })
    })));
  } catch (error) {
    await deleteNotificationAttachment(attachmentRecord?._id).catch(() => {});
    throw error;
  }
  await Promise.all(notifications.map(pushNotification));
  return notifications;
};

module.exports = {
  createNotification,
  createNotifications,
  pushNotification
};
