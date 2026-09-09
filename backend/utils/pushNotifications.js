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
  icon: '/warriors-icon-192.png',
  badge: '/warriors-icon-192.png',
  notificationId: payload.notificationId ? String(payload.notificationId) : '',
  type: String(payload.type || 'notification'),
  testId: String(payload.testId || ''),
  url: String(payload.url || '/parent/notifications')
});

const sendWithRetry = async (subscription, payload) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await webpush.sendNotification(subscription, payload, {
        TTL: 60 * 60,
        urgency: 'high',
        timeout: 10000
      });
    } catch (error) {
      const status = error.statusCode;
      const transient = !status || status === 408 || status === 429 || status >= 500;
      const retryAfter = error.headers?.['retry-after'];
      const seconds = Number(retryAfter);
      const delay = retryAfter
        ? Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now())
        : 1000;
      // Keep request latency bounded; never retry permission or expired-endpoint errors.
      if (attempt || !transient || !Number.isFinite(delay) || delay > 2000) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

const sendPushToUser = async (userId, payload = {}, { endpoint } = {}) => {
  if (!userId || !isPushConfigured()) {
    return { attempted: 0, sent: 0, deleted: 0, failed: 0 };
  }

  const filter = { userId };
  if (endpoint) filter.endpoint = endpoint;
  const subscriptions = await PushSubscription.find(filter).lean();
  const results = await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await sendWithRetry(subscription, JSON.stringify(normalizePayload(payload)));
      return { sent: 1, deleted: 0, failed: 0 };
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) {
        await PushSubscription.deleteOne({ userId, endpoint: subscription.endpoint });
        return { sent: 0, deleted: 1, failed: 0 };
      } else {
        // Authentication and temporary provider failures do not expire a subscription.
        console.error('Push notification failed:', { statusCode: error.statusCode, message: error.message });
        return { sent: 0, deleted: 0, failed: 1 };
      }
    }
  }));

  return results.reduce((summary, result) => ({
    attempted: summary.attempted + 1,
    sent: summary.sent + result.sent,
    deleted: summary.deleted + result.deleted,
    failed: summary.failed + result.failed
  }), { attempted: 0, sent: 0, deleted: 0, failed: 0 });
};

module.exports = {
  getVapidPublicKey,
  isPushConfigured,
  sendPushToUser
};
