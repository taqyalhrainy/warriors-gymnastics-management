const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const DEFAULT_PUBLIC_KEY = 'BPX1bmzmVc5u_8CkeNbYx7j1Dez4Di2L3LkKIYOCzTky05-M_ckNqanpLJDiGXdEG2uty0Gi-d-lbv1HHLUt11M';
const DEFAULT_PRIVATE_KEY = '0yE06kAyIicev6mUP13yuNvZlJOhwzhb5sPYdEoBOZk';

const publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_PRIVATE_KEY;
const contact = process.env.VAPID_CONTACT || 'mailto:admin@warriorsgym.com';

webpush.setVapidDetails(contact, publicKey, privateKey);

const getVapidPublicKey = () => publicKey;

const sendPushToUser = async (userId, payload) => {
  if (!userId) return;

  const subscriptions = await PushSubscription.find({ userId }).lean();
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
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
  sendPushToUser
};
