import { useEffect, useRef } from 'react';
import { fetchNotifications, syncCurrentDevicePushSubscription } from '../services/notifications.js';
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

const ParentMessageNotifier = () => {
  const { user } = useAuth();
  const seenIdsRef = useRef(readSeenIds());
  const seededRef = useRef(false);

  useEffect(() => {
    if (user?.role !== 'parent') return undefined;

    seededRef.current = false;
    let syncing = false;
    let lastSync = 0;
    const sync = async () => {
      if (syncing || Date.now() - lastSync < 60000) return;
      syncing = true;
      try {
        await syncCurrentDevicePushSubscription();
        lastSync = Date.now();
      } catch (error) {
        console.error('Phone notification registration failed:', error.message);
      } finally {
        syncing = false;
      }
    };
    sync();
    const resume = () => {
      if (!document.hidden) sync();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);

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
          // OS notifications come only from push, including while this page is open.
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
        sync();
        checkMessages().catch(console.error);
      }
    }, POLL_MS);

    return () => {
      window.clearTimeout(firstCheckTimer);
      window.clearInterval(timer);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [user?.role, user?.id]);

  return null;
};

export default ParentMessageNotifier;
