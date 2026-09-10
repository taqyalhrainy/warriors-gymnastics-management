import api from './api.js';
import { App } from '@capacitor/app';
import {
  NativePushSession, isNativeAndroidApp, getNativeAndroidPermissionState, getStoredNativeAndroidToken,
  requestNativeAndroidToken, setupNativePushListeners, unregisterNativeAndroidPush
} from '../utils/nativePushNotifications.js';

const DISABLED_KEY = 'warriors-native-push-disabled';
let operation = Promise.resolve();
let sessionReady = Promise.resolve();
let activeSession = null;
let listening = false;
const updateDevice = (callback) => {
  const next = operation.then(callback);
  operation = next.catch(() => {});
  return next;
};
const headersFor = (session) => ({ headers: { Authorization: 'Bearer ' + session.authToken },
  __skipAuthInvalidation: true, __skipRetry: true, __skipNetworkStatus: true, timeout: 15000 });
const isCurrent = (session) => session && session === activeSession;
const unsubscribe = (session, token) => token && session
  ? api.delete('/push/native/unsubscribe', { ...headersFor(session), data: { token } }) : Promise.resolve();

const saveToken = async (token, session) => {
  await sessionReady;
  if (!isCurrent(session)) return;
  const device = await NativePushSession.getDevice();
  const app = await App.getInfo();
  if (!isCurrent(session)) return;
  await api.post('/push/native/subscribe', { token, platform: 'android', deviceId: device.deviceId,
    sessionId: session.sessionId, transportVersion: 2, appVersion: app.version }, headersFor(session));
  if (!isCurrent(session)) await unsubscribe(session, token).catch(() => {});
};

export const setNativeNotificationSession = (user, authToken) => {
  if (!isNativeAndroidApp()) return Promise.resolve();
  if (activeSession?.authToken === authToken && activeSession?.userId === user?.id) return sessionReady;
  const previous = activeSession;
  const oldToken = getStoredNativeAndroidToken();
  const session = user?.role === 'parent' && authToken ? { userId: user.id || user._id, authToken } : null;
  activeSession = session;
  // Close delivery immediately, including during offline logout.
  const closed = NativePushSession.setSession({ userId: '', sessionId: '' });
  sessionReady = sessionReady.catch(() => {}).then(async () => {
    await closed;
    if (!isCurrent(session)) return;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authToken));
    session.sessionId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (isCurrent(session) && localStorage.getItem(DISABLED_KEY) !== 'true') {
      await NativePushSession.setSession({ userId: session.userId, sessionId: session.sessionId, authToken });
    }
  });
  const ready = sessionReady;
  ready.then(() => window.dispatchEvent?.(new Event('native-push:status'))).catch(() => {});
  updateDevice(async () => {
    if (previous) await unsubscribe(previous, oldToken).catch(() => {});
    if (!session) await unregisterNativeAndroidPush().catch(() => {});
    await ready;
  }).catch(console.error);
  if (!listening) {
    listening = true;
    window.addEventListener('native-push:token', ({ detail }) => {
      const owner = activeSession;
      if (owner && localStorage.getItem(DISABLED_KEY) !== 'true') {
        updateDevice(() => isCurrent(owner) ? saveToken(detail, owner) : undefined).catch(console.error);
      }
    });
  }
  return ready;
};

export const getNativeNotificationStatus = async () => {
  const session = activeSession;
  if (!session) return { configured: false, subscribed: false };
  const permission = await getNativeAndroidPermissionState();
  const token = getStoredNativeAndroidToken();
  const response = await api.get('/push/native/status', { ...headersFor(session), params: { token } });
  return { configured: response.data.configured,
    subscribed: Boolean(token) && isCurrent(session) && permission === 'granted' && response.data.subscribed
      && localStorage.getItem(DISABLED_KEY) !== 'true' };
};

export const enableNativeNotifications = () => {
  const session = activeSession;
  return updateDevice(async () => {
    await sessionReady;
    if (!isCurrent(session)) throw new Error('Sign in before enabling notifications.');
    const token = await requestNativeAndroidToken();
    if (!isCurrent(session)) return;
    await NativePushSession.setSession({ userId: session.userId, sessionId: session.sessionId, authToken: session.authToken });
    await saveToken(token, session);
    if (!isCurrent(session)) return;
    localStorage.removeItem(DISABLED_KEY);
    await api.post('/push/native/test', { token }, headersFor(session));
  });
};

export const disableNativeNotifications = () => {
  const session = activeSession;
  localStorage.setItem(DISABLED_KEY, 'true');
  const closed = NativePushSession.setSession({ userId: '', sessionId: '' });
  return updateDevice(async () => {
    await closed;
    const token = getStoredNativeAndroidToken();
    await unsubscribe(session, token).catch(() => {});
    await unregisterNativeAndroidPush();
  });
};

export const syncNativeNotifications = () => {
  const session = activeSession;
  return updateDevice(async () => {
    await sessionReady;
    if (!isCurrent(session) || localStorage.getItem(DISABLED_KEY) === 'true') return;
    await setupNativePushListeners();
    if (await getNativeAndroidPermissionState() !== 'granted') return;
    await saveToken(await requestNativeAndroidToken({ prompt: false }), session);
  });
};
