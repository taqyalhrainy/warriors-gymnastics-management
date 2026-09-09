import api from './api.js';
import {
  getNativeAndroidPermissionState, getStoredNativeAndroidToken,
  requestNativeAndroidToken, setupNativePushListeners, unregisterNativeAndroidPush
} from '../utils/nativePushNotifications.js';

const DISABLED_KEY = 'warriors-native-push-disabled';
let operation = Promise.resolve();
const updateDevice = (callback) => {
  const next = operation.then(callback);
  operation = next.catch(() => {});
  return next;
};

const saveToken = (token) => api.post('/push/native/subscribe', { token, platform: 'android' });

export const getNativeNotificationStatus = async () => {
  const permission = await getNativeAndroidPermissionState();
  const token = getStoredNativeAndroidToken();
  const response = await api.get('/push/native/status', { params: { token }, __maxRetries: 1 });
  return {
    configured: response.data.configured,
    subscribed: Boolean(token) && permission === 'granted' && response.data.subscribed
      && localStorage.getItem(DISABLED_KEY) !== 'true'
  };
};

export const enableNativeNotifications = () => updateDevice(async () => {
  const token = await requestNativeAndroidToken();
  await saveToken(token);
  localStorage.removeItem(DISABLED_KEY);
  await api.post('/push/native/test', { token }, { timeout: 25000 });
});

export const disableNativeNotifications = () => updateDevice(async () => {
  const token = getStoredNativeAndroidToken();
  if (token) await api.delete('/push/native/unsubscribe', { data: { token } });
  await unregisterNativeAndroidPush();
  localStorage.setItem(DISABLED_KEY, 'true');
});

export const syncNativeNotifications = () => updateDevice(async () => {
  await setupNativePushListeners();
  if (localStorage.getItem(DISABLED_KEY) === 'true'
    || await getNativeAndroidPermissionState() !== 'granted') return;
  await saveToken(await requestNativeAndroidToken());
});
