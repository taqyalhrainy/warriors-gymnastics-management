import { useEffect, useState } from 'react';
import {
  deletePushSubscription,
  fetchPushPublicKey,
  fetchPushStatus,
  savePushSubscription
} from '../services/notifications.js';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const getSubscription = async () => {
  if (!isSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
};

const PushNotificationSettings = () => {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('');

  const refreshStatus = async () => {
    if (!isSupported()) {
      setStatus('unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setStatus('install-first');
      return;
    }
    const subscription = await getSubscription();
    if (!subscription) {
      setStatus(Notification.permission === 'denied' ? 'denied' : 'disabled');
      return;
    }
    const serverStatus = await fetchPushStatus(subscription.endpoint).catch(() => ({ subscribed: true }));
    setStatus(serverStatus.subscribed ? 'enabled' : 'disabled');
  };

  useEffect(() => {
    refreshStatus().catch(() => setStatus('disabled'));
  }, []);

  const enableNotifications = async () => {
    setMessage('');
    if (!isSupported()) {
      setStatus('unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      setStatus('install-first');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return;
    }
    const publicKey = await fetchPushPublicKey();
    if (!publicKey) {
      setMessage('Push is not configured on the server yet.');
      setStatus('disabled');
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    await savePushSubscription(subscription.toJSON());
    setStatus('enabled');
  };

  const disableNotifications = async () => {
    const subscription = await getSubscription();
    if (subscription) {
      await deletePushSubscription({ endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setStatus('disabled');
  };

  const label = status === 'enabled'
    ? 'Enabled on this device'
    : status === 'install-first'
      ? 'Install the app to your Home Screen first'
      : status === 'unsupported'
        ? 'Not supported on this device'
        : status === 'denied'
          ? 'Permission blocked'
          : 'Disabled';

  return (
    <div className="parent-setting-panel">
      <button
        type="button"
        className={`parent-setting-choice ${status === 'enabled' ? 'is-selected' : ''}`}
        onClick={status === 'enabled' ? disableNotifications : enableNotifications}
        disabled={status === 'checking' || status === 'unsupported' || status === 'install-first'}
      >
        <span>Phone notifications</span>
        <strong>{status === 'enabled' ? 'Disable' : 'Enable'}</strong>
      </button>
      <p className="parent-setting-note">{message || label}</p>
    </div>
  );
};

export default PushNotificationSettings;
