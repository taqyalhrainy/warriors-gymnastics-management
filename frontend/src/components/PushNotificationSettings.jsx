import { useEffect, useState } from 'react';
import { isNativeAndroidApp } from '../utils/nativePushNotifications.js';
import NativePhoneNotifications from './NativePhoneNotifications.jsx';
import {
  disableCurrentDeviceNotifications,
  fetchCurrentDevicePushStatus,
  registerAndTestPushSubscription
} from '../services/notifications.js';
import {
  isIos,
  isPushSupported,
  isStandalone,
  pushTestMessage,
  requestPhoneNotificationPermission,
  observeNotificationPermission
} from '../utils/pushNotifications.js';

const getIosHelp = () => (
  isStandalone()
    ? 'Open iPhone Settings > Notifications > Warriors, then turn on Allow Notifications. If Warriors is not listed, remove the Home Screen app, add it again from Safari, then tap Allow.'
    : 'Open this site in Safari, tap Share, Add to Home Screen, then open Warriors from the Home Screen icon and tap Allow.'
);

const PushNotificationSettings = () => {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshStatus = async () => {
    if (isIos() && !isStandalone()) {
      setMessage(getIosHelp());
      setStatus('install-first');
      return;
    }
    if (!isPushSupported()) {
      setMessage(window.isSecureContext ? 'This browser does not support phone notifications.' : 'Open the app with HTTPS to enable phone notifications.');
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setMessage('');
      setStatus('denied');
      return;
    }
    if (Notification.permission === 'default') {
      setMessage('');
      setStatus('disabled');
      return;
    }
    const currentStatus = await fetchCurrentDevicePushStatus();
    if (!currentStatus.configured) {
      setMessage('Push is not configured on the server yet.');
      setStatus('disabled');
      return;
    }
    setStatus(currentStatus.subscribed ? 'enabled' : 'disabled');
  };

  useEffect(() => {
    const refresh = () => refreshStatus().catch(() => {
      setStatus('disabled');
      setMessage('Unable to check phone notifications. Please try Enable again.');
    });
    refresh();
    window.addEventListener('push:changed', refresh);
    const stopObserving = observeNotificationPermission(refresh);
    return () => {
      window.removeEventListener('push:changed', refresh);
      stopObserving();
    };
  }, []);

  const enableNotifications = async () => {
    setMessage('');
    if (isIos() && !isStandalone()) {
      setMessage(getIosHelp());
      setStatus('install-first');
      return;
    }
    if (!isPushSupported()) {
      setMessage(window.isSecureContext ? 'This browser does not support phone notifications.' : 'Open the app with HTTPS to enable phone notifications.');
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setMessage(isIos() ? getIosHelp() : 'Android or the browser has blocked notifications. The app cannot change this permission.');
      setStatus('denied');
      return;
    }
    setBusy(true);
    try {
      const permission = await requestPhoneNotificationPermission();
      if (permission !== 'granted') {
        setMessage(permission === 'denied'
          ? (isIos() ? getIosHelp() : 'Chrome or Android has blocked notifications for this site.')
          : 'Permission was not granted. Tap Enable to ask again.');
        setStatus(permission === 'denied' ? 'denied' : 'disabled');
        return;
      }
      const { delivery } = await registerAndTestPushSubscription();
      setMessage(pushTestMessage(delivery));
      setStatus('enabled');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to enable phone notifications. Please try again.');
      setStatus('disabled');
    } finally {
      setBusy(false);
    }
  };

  const disableNotifications = async () => {
    setBusy(true);
    try {
      await disableCurrentDeviceNotifications();
      setStatus('disabled');
      setMessage('Phone notifications are disabled on this device.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to disable phone notifications.');
    } finally {
      setBusy(false);
    }
  };

  const testNotifications = async () => {
    setMessage('');
    setBusy(true);
    try {
      const { delivery } = await registerAndTestPushSubscription();
      setMessage(pushTestMessage(delivery));
      setStatus('enabled');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Unable to send a test notification.');
      setStatus('disabled');
    } finally {
      setBusy(false);
    }
  };

  const label = status === 'enabled'
    ? 'Enabled on this device'
    : status === 'install-first'
      ? 'Install the app to your Home Screen first'
      : status === 'unsupported'
        ? 'Not supported on this device'
        : status === 'denied'
          ? (isIos() ? getIosHelp() : 'Permission blocked')
          : 'Disabled';

  return (
    <div className="parent-setting-panel">
      <button
        type="button"
        className={`parent-setting-choice ${status === 'enabled' ? 'is-selected' : ''}`}
        onClick={status === 'enabled' ? disableNotifications : enableNotifications}
        disabled={busy || status === 'checking' || status === 'unsupported' || status === 'install-first'}
      >
        <span>Phone notifications</span>
        <strong>{busy ? 'Please wait...' : status === 'enabled' ? 'Disable' : 'Enable'}</strong>
      </button>
      {status === 'enabled' && (
        <button type="button" className="parent-setting-choice" onClick={testNotifications} disabled={busy}>
          <span>Test notification</span>
          <strong>Send</strong>
        </button>
      )}
      <p className="parent-setting-note" role="status">{message || label}</p>
    </div>
  );
};

export default function PhoneNotificationSettings() {
  return isNativeAndroidApp() ? <NativePhoneNotifications /> : <PushNotificationSettings />;
}
