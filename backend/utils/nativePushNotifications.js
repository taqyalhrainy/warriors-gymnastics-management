const NativePushToken = require('../models/NativePushToken');

let firebaseMessaging = null;
let firebaseInitError = null;

const parseServiceAccount = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (rawJson.trim()) {
    const decoded = rawJson.trim().startsWith('{')
      ? rawJson
      : Buffer.from(rawJson, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  return null;
};

const getFirebaseAdmin = () => {
  if (firebaseInitError) return null;
  if (firebaseMessaging) return firebaseMessaging;

  try {
    const serviceAccount = parseServiceAccount();
    if (!serviceAccount) return null;

    const { getApps, initializeApp, cert } = require('firebase-admin/app');
    const { getMessaging } = require('firebase-admin/messaging');
    const app = getApps().find((item) => item.name === 'warriors-push')
      || initializeApp({ credential: cert(serviceAccount) }, 'warriors-push');
    firebaseMessaging = getMessaging(app);
    return firebaseMessaging;
  } catch (error) {
    firebaseInitError = error;
    console.error('Firebase push initialization failed:', error.message);
    return null;
  }
};

const isNativePushConfigured = () => Boolean(getFirebaseAdmin());

const normalizePayload = (payload = {}) => ({
  title: String(payload.title || 'Warriors Gymnastics'),
  body: String(payload.body || payload.message || ''),
  notificationId: payload.notificationId ? String(payload.notificationId) : '',
  type: String(payload.type || 'notification'),
  url: String(payload.url || '/parent/notifications')
});

const shouldDeleteToken = (error) => [
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
].includes(error.code);

const sendNativePushToUser = async (userId, payload = {}, { token } = {}) => {
  const admin = getFirebaseAdmin();
  if (!userId || !admin) {
    return { attempted: 0, sent: 0, deleted: 0, failed: 0 };
  }

  const filter = { userId, platform: 'android' };
  if (token) filter.token = token;
  const tokens = await NativePushToken.find(filter).lean();
  const data = normalizePayload(payload);

  const results = await Promise.all(tokens.map(async (savedToken) => {
    try {
      const androidNotification = {
        channelId: 'warriors_messages',
        defaultSound: true,
        visibility: 'public'
      };
      if (data.notificationId) androidNotification.tag = data.notificationId;

      await admin.send({
        token: savedToken.token,
        notification: {
          title: data.title,
          body: data.body
        },
        data,
        android: {
          priority: 'high',
          ttl: 60 * 60 * 1000,
          notification: androidNotification
        }
      });
      return { sent: 1, deleted: 0, failed: 0 };
    } catch (error) {
      if (shouldDeleteToken(error)) {
        await NativePushToken.deleteOne({ userId, token: savedToken.token });
        return { sent: 0, deleted: 1, failed: 0 };
      }

      console.error('Native Android push failed:', { code: error.code, message: error.message });
      return { sent: 0, deleted: 0, failed: 1 };
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
  isNativePushConfigured,
  sendNativePushToUser
};
