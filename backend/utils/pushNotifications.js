const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || process.env.VAPID_CONTACT || 'mailto:admin@warriorsgym.com';

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

const getVapidPublicKey = () => publicKey;
const isPushConfigured = () => Boolean(publicKey && privateKey);

const normalizePayload = (payload = {}) => ({
  title: String(payload.title || 'Warriors Gymnastics'),
  body: String(payload.body || payload.message || ''),
  icon: '/warriors-logo.png',
  badge: '/warriors-logo.png',
  notificationId: payload.notificationId ? String(payload.notificationId) : '',
  type: String(payload.type || 'notification'),
  url: String(payload.url || '/parent/notifications')
});

const sendPushToUser = async (userId, payload) => {
  if (!userId || !isPushConfigured()) return;

  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(normalizePayload(payload)));
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
      } else {
        console.error('Push notification failed:', error.message);
      }
    }
  }));
};

module.exports = {
  getVapidPublicKey,
  isPushConfigured,
  sendPushToUser
};
