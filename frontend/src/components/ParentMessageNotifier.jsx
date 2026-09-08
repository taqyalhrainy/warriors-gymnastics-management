import { useEffect, useRef } from 'react';
import { fetchNotifications } from '../services/notifications.js';
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

    const requestOnFirstTap = () => {
      ensurePermission().catch(console.error);
      window.removeEventListener('pointerdown', requestOnFirstTap);
      window.removeEventListener('keydown', requestOnFirstTap);
    };

    if (canNotify() && Notification.permission === 'default') {
      window.addEventListener('pointerdown', requestOnFirstTap, { once: true });
      window.addEventListener('keydown', requestOnFirstTap, { once: true });
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

    checkMessages().catch(console.error);
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        checkMessages().catch(console.error);
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('pointerdown', requestOnFirstTap);
      window.removeEventListener('keydown', requestOnFirstTap);
    };
  }, [user?.role]);

  return null;
};

export default ParentMessageNotifier;
