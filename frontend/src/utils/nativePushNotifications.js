import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const ANDROID_CHANNEL_ID = 'warriors_messages';
const NATIVE_ANDROID_TOKEN_KEY = 'warriors-native-android-push-token';
let listenersReady = false;

export const isNativeAndroidApp = () => (
  Capacitor.isNativePlatform?.()
  && Capacitor.getPlatform?.() === 'android'
  && Capacitor.isPluginAvailable?.('PushNotifications')
);

const getNotificationUrl = (notification) => {
  const data = notification?.notification?.data || notification?.data || {};
  const url = data.url || data.link || '/parent/notifications';
  return String(url).startsWith('/') && !String(url).startsWith('//') ? url : '/parent/notifications';
};

export const setupNativePushListeners = async () => {
  if (!isNativeAndroidApp() || listenersReady) return;
  listenersReady = true;

  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const url = getNotificationUrl(event);
    window.location.assign(url);
  });

  await PushNotifications.createChannel({
    id: ANDROID_CHANNEL_ID,
    name: 'Warriors Messages',
    description: 'Parent messages from Warriors Gymnastics',
    importance: 4,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#0EA5E9'
  }).catch(() => undefined);
};

export const requestNativeAndroidToken = async () => {
  if (!isNativeAndroidApp()) {
    throw new Error('Android app notifications are only available inside the installed app.');
  }

  await setupNativePushListeners();
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    throw new Error('Android notification permission was not allowed.');
  }

  let cleanup = () => Promise.resolve();
  let listenersPromise = Promise.resolve();
  const tokenPromise = new Promise((resolve, reject) => {
    let registrationHandle = null;
    let errorHandle = null;
    let timer = window.setTimeout(() => {
      reject(new Error('Android notification setup timed out. Please try again.'));
    }, 20000);

    cleanup = async () => {
      window.clearTimeout(timer);
      await registrationHandle?.remove?.();
      await errorHandle?.remove?.();
    };

    const finish = async (callback) => {
      await cleanup();
      callback();
    };

    listenersPromise = Promise.all([
      PushNotifications.addListener('registration', async (token) => {
        await finish(() => resolve(token.value));
      }),
      PushNotifications.addListener('registrationError', async (error) => {
        await finish(() => reject(new Error(error.error || 'Android notification registration failed.')));
      })
    ]).then(([registration, registrationError]) => {
      registrationHandle = registration;
      errorHandle = registrationError;
    }).catch(reject);
  });

  try {
    await listenersPromise;
    await PushNotifications.register();
    const token = await tokenPromise;
    localStorage.setItem(NATIVE_ANDROID_TOKEN_KEY, token);
    return token;
  } catch (error) {
    await cleanup();
    throw error;
  }
};

export const getNativeAndroidPermissionState = async () => {
  if (!isNativeAndroidApp()) return 'denied';
  const permission = await PushNotifications.checkPermissions();
  return permission.receive;
};

export const unregisterNativeAndroidPush = async () => {
  if (!isNativeAndroidApp()) return;
  await PushNotifications.unregister();
  localStorage.removeItem(NATIVE_ANDROID_TOKEN_KEY);
};

export const getStoredNativeAndroidToken = () => localStorage.getItem(NATIVE_ANDROID_TOKEN_KEY) || '';
