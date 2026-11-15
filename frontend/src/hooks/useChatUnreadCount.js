import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchChatUnreadCount } from '../services/chat.js';

export const useChatUnreadCount = () => {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const userId = user?.id || user?._id;
  useEffect(() => {
    setCount(0);
    if (!userId) return undefined;
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden || controller.signal.aborted) return;
      busy = true;
      try {
        const result = await fetchChatUnreadCount(controller.signal);
        if (!controller.signal.aborted) setCount(result.count || 0);
      } catch { /* Keep the last confirmed count until connectivity returns. */ }
      finally { busy = false; }
    };
    refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('chat:changed', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('chat:changed', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [userId]);
  return count;
};
