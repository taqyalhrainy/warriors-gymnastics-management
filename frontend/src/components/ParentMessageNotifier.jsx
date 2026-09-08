import { useEffect, useRef } from 'react';
import { fetchNotifications, fetchPushPublicKey, savePushSubscription } from '../services/notifications.js';
import { useAuth } from '../context/AuthContext.jsx';

const SEEN_KEY = 'warriors-parent-notification-seen-ids';
const POLL_MS = 30000;

const readSeenIds = () => {
  try {
    const ids = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    return Array.isArray(ids) ? new Set(ids.map(String)) : new Set();
  } catch (error) {
    return new Set();
  }
};

const writeSeenIds = (ids) => {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)));
};

const canNotify = () => 'Notification' in window;

const ensurePermission = async () => {
  if (!canNotify() || Notification.permission === 'denied') return false;
  if (Notification.permission === 'granted') return true;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

const ensurePushSubscription = async () => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!(await ensurePermission())) return;

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const publicKey = await fetchPushPublicKey();
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }
  await savePushSubscription(subscription.toJSON());
};

const showParentNotification = async (note) => {
  if (!canNotify() || Notification.permission !== 'granted') return;

  const url = `/parent/notifications/${note._id}`;
  const options = {
    body: note.message || 'New message',
    icon: '/warriors-logo.png',
    badge: '/warriors-logo.png',
    tag: `parent-message-${note._id}`,
    data: { url }
  };

  const registration = await navigator.serviceWorker?.ready.catch(() => null);
  if (registration?.showNotification) {
    registration.showNotification(note.title || 'New message', options);
    return;
  }

  const notification = new Notification(note.title || 'New message', options);
  notification.onclick = () => {
    window.focus();
    window.location.assign(url);
    notification.close();
  };
};

const ParentMessageNotifier = () => {
  const { user } = useAuth();
  const seenIdsRef = useRef(readSeenIds());
  const seededRef = useRef(false);

  useEffect(() => {
    if (user?.role !== 'parent') return undefined;

    if (canNotify() && Notification.permission === 'granted') {
      ensurePushSubscription().catch(console.error);
    }

    const checkMessages = async () => {
      const notes = await fetchNotifications({ force: true });
      const unread = notes.filter((note) => !note.isRead && note._id);
      const seenIds = seenIdsRef.current;

      if (!seededRef.current) {
        unread.forEach((note) => seenIds.add(String(note._id)));
        writeSeenIds(seenIds);
        seededRef.current = true;
        return;
      }

      for (const note of unread.slice().reverse()) {
        const id = String(note._id);
        if (!seenIds.has(id)) {
          seenIds.add(id);
          showParentNotification(note).catch(console.error);
          window.dispatchEvent(new Event('notifications:changed'));
        }
      }
      writeSeenIds(seenIds);
    };

    const firstCheckTimer = window.setTimeout(() => {
      checkMessages().catch(console.error);
    }, 8000);
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        checkMessages().catch(console.error);
      }
    }, POLL_MS);

    return () => {
      window.clearTimeout(firstCheckTimer);
      window.clearInterval(timer);
    };
  }, [user?.role]);

  return null;
};

export default ParentMessageNotifier;
