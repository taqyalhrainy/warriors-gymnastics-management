import { Capacitor, registerPlugin } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

export const NativePushSession = registerPlugin('NativePushSession');
const TOKEN_KEY = 'warriors-native-android-push-token';
export const NATIVE_TAP_KEY = 'warriors-native-push-destination';
let setupPromise;
let pendingRegistration;

// Never fall back to Chrome if a native plugin is missing or fails.
export const isNativeAndroidApp = () => Boolean(
  Capacitor.isNativePlatform?.() && Capacitor.getPlatform?.() === 'android'
);

export const safeNotificationUrl = (value) => {
  const url = String(value || '');
  return /^\/parent(?:\/(?:notifications(?:\/[a-f\d]{24})?|attendance|payments|settings|children|subscriptions))?(?:\?[^\\#]*)?$/.test(url)
    && !/[\x00-\x20\\]/.test(url) ? url : '/parent/notifications';
};

export const setupNativePushListeners = () => {
  if (!isNativeAndroidApp()) return Promise.resolve();
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    const handles = [];
    try {
      handles.push(await PushNotifications.addListener('registration', ({ value }) => {
        if (!value) return;
        localStorage.setItem(TOKEN_KEY, value);
        if (pendingRegistration) pendingRegistration.resolve(value);
        else window.dispatchEvent(new CustomEvent('native-push:token', { detail: value }));
      }));
      handles.push(await PushNotifications.addListener('registrationError', (error) => {
        pendingRegistration?.reject(new Error(error.error || 'Android push registration failed.'));
      }));
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        const data = event?.notification?.data || {};
        sessionStorage.setItem(NATIVE_TAP_KEY, JSON.stringify({ url: safeNotificationUrl(data.url), userId: data.userId || '' }));
        window.dispatchEvent(new Event('native-push:tap'));
      }));
      await PushNotifications.createChannel({ id: 'warriors_messages', name: 'Warriors Messages',
        description: 'Parent messages from Warriors Gymnastics', importance: 4, visibility: 0,
        vibration: true, lights: true });
    } catch (error) {
      await Promise.all(handles.map((handle) => handle.remove()));
      setupPromise = undefined;
      throw error;
    }
  })();
  return setupPromise;
};

export const requestNativeAndroidToken = async ({ prompt = true } = {}) => {
  if (!isNativeAndroidApp()) throw new Error('Native Android app required.');
  await setupNativePushListeners();
  const permission = prompt ? await PushNotifications.requestPermissions() : await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') throw new Error('Android notification permission was not allowed.');
  if (!(await NativePushSession.getDevice()).notificationsEnabled) {
    throw new Error('Notifications are disabled in Android settings for this app.');
  }
  if (pendingRegistration) return pendingRegistration.promise;
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  pendingRegistration = { resolve, reject, promise };
  const timer = window.setTimeout(() => reject(new Error('Android notification registration timed out.')), 20000);
  const registration = PushNotifications.register().catch(reject);
  try {
    const token = await promise;
    await registration;
    return token;
  } finally {
    window.clearTimeout(timer);
    pendingRegistration = undefined;
  }
};

export const getNativeAndroidPermissionState = async () => {
  if (!isNativeAndroidApp()) return 'denied';
  const permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') return permission.receive;
  const device = await NativePushSession.getDevice();
  return device.notificationsEnabled ? 'granted' : 'denied';
};

export const unregisterNativeAndroidPush = async () => {
  if (!isNativeAndroidApp()) return;
  localStorage.removeItem(TOKEN_KEY);
  await NativePushSession.deleteToken();
};

export const getStoredNativeAndroidToken = () => localStorage.getItem(TOKEN_KEY) || '';
