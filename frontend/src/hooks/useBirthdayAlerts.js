import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { fetchPlayerAlertCandidates } from '../services/players.js';
import { birthdayDay, todaysBirthdays, readBirthdayIds } from '../utils/birthdayAlerts.js';

export const useBirthdayAlerts = () => {
  const { user } = useAuth();
  const userId = user?.id || user?._id;
  const enabled = Boolean(userId && user.role !== 'parent');
  const [players, setPlayers] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [day, setDay] = useState(birthdayDay);
  const [readIds, setReadIds] = useState([]);
  useEffect(() => {
    let active = true;
    setPlayers([]);
    setReady(false);
    if (!enabled) return undefined;
    const syncRead = () => {
      const today = birthdayDay();
      setDay(today);
      setReadIds(readBirthdayIds(userId, today));
    };
    const refresh = () => {
      syncRead();
      fetchPlayerAlertCandidates().then((rows) => {
        if (!active) return;
        setPlayers(rows);
        setReady(true);
        setError('');
      }).catch(() => { if (active) setError('Unable to load birthdays'); });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('players:changed', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('birthdays:read', syncRead);
    window.addEventListener('storage', syncRead);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('players:changed', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('birthdays:read', syncRead);
      window.removeEventListener('storage', syncRead);
    };
  }, [enabled, userId]);
  const birthdays = enabled ? todaysBirthdays(players, day) : [];
  return { players: enabled ? players : [], birthdays, day, userId, ready, error, unread: birthdays.filter((player) => !readIds.includes(String(player._id))).length };
};
