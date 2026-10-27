import { waitForApiHealth } from './api.js';
import { isNativeAndroidApp } from '../utils/nativePushNotifications.js';

const BROWSER_WAKE_MAX_MS = 90000;
const NATIVE_WAKE_MAX_MS = 30000;

const isServerWakeError = (error) => {
  const status = error.response?.status;
  return !error.response || error.code === 'ECONNABORTED' || [502, 503, 504].includes(status);
};

export const sendAuthWithWakeRetry = async (requestFn, onWaiting = () => {}) => {
  try {
    return await requestFn();
  } catch (error) {
    if (!isServerWakeError(error)) throw error;

    onWaiting(true);
    await waitForApiHealth({
      timeout: 4000,
      maxWaitMs: isNativeAndroidApp() ? NATIVE_WAKE_MAX_MS : BROWSER_WAKE_MAX_MS,
      pollIntervalMs: 750
    });

    // Authentication is attempted only once after health is confirmed. This
    // avoids repeated password requests while the server is unavailable.
    return requestFn();
  }
};
