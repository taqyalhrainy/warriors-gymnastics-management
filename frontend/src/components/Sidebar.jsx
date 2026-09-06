import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { fetchUnreadCount } from '../services/notifications.js';
import { fetchPlayers } from '../services/players.js';
import warriorsLogo from '../assets/warriors-logo.png';

const EXPIRED_ALERT_READ_KEY = 'warriors-expired-alert-read-ids';

const getExpiredAlertKey = (player) => `${player._id}:${player.endDate ? new Date(player.endDate).toISOString().split('T')[0] : ''}`;

const readExpiredAlertIds = () => {
  try {
    const ids = JSON.parse(localStorage.getItem(EXPIRED_ALERT_READ_KEY) || '[]');
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch (error) {
    return [];
  }
};

const getUnreadExpiredAlertCount = (players) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const readIds = readExpiredAlertIds();

  return players.filter((player) => {
    if (player.status !== 'active' || !player.endDate) return false;
    const endDate = new Date(player.endDate);
    endDate.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((endDate.getTime() - today.getTime()) / 86400000);
    return daysLeft === 0 && !readIds.includes(getExpiredAlertKey(player));
  }).length;
};

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [expiredAlertCount, setExpiredAlertCount] = useState(0);

  useEffect(() => {
    if (user?.role !== 'parent') {
      setUnreadCount(0);
      return undefined;
    }

    const loadUnreadCount = () => {
      fetchUnreadCount()
        .then((result) => setUnreadCount(result.count || 0))
        .catch(console.error);
    };

    loadUnreadCount();
    window.addEventListener('notifications:changed', loadUnreadCount);

    return () => window.removeEventListener('notifications:changed', loadUnreadCount);
  }, [user]);

  useEffect(() => {
    if (!user || user.role === 'parent') {
      setExpiredAlertCount(0);
      return undefined;
    }

    let isMounted = true;
    const loadExpiredAlertCount = () => {
      fetchPlayers({ sidebar: 'expired-alert-count' })
        .then((players) => {
          if (isMounted) setExpiredAlertCount(getUnreadExpiredAlertCount(players));
        })
        .catch(console.error);
    };

    const initialTimer = setTimeout(loadExpiredAlertCount, 1500);
    window.addEventListener('players:changed', loadExpiredAlertCount);
    window.addEventListener('expired-alerts:read', loadExpiredAlertCount);
    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      window.removeEventListener('players:changed', loadExpiredAlertCount);
      window.removeEventListener('expired-alerts:read', loadExpiredAlertCount);
    };
  }, [user, pathname]);

  const isParentArea = pathname === '/parent' || pathname.startsWith('/parent/');

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to log out?')) {
      logout();
    }
  };

  const links = isParentArea
    ? [
      { path: '/parent', key: 'home', label: 'Home' },
      { path: '/parent/attendance', key: 'attendance' },
      { path: '/parent/payments', key: 'payments' },
      { path: '/parent/notifications', key: 'notifications' }
    ]
    : [
      { path: '/admin', key: 'dashboard' },
      { path: '/players', key: 'players' },
      { path: '/parents', key: 'parents' },
      { path: '/groups', key: 'groups' },
      { path: '/attendance', key: 'attendance' },
      { path: '/coaches', key: 'coaches' },
      { path: '/payments', key: 'payments' },
      { path: '/notifications', key: 'notifications' },
      { path: '/history', key: 'history' },
      { path: '/security', key: 'security' }
    ];

  return (
    <aside className={`sidebar${isParentArea ? ' parent-sidebar' : ''}`}>
      <div className="brand-panel">
        <img className="brand-logo" src={warriorsLogo} alt="Warriors Gymnastics Academy" />
        <div className="brand-name">{t('appName')}</div>
      </div>
      <div className="sidebar-links">
        {links.map((link) => (
          <NavLink key={link.path} to={link.path} className={({ isActive }) => isActive ? 'active' : ''}>
            <span>{link.label || t(link.key)}</span>
            {user?.role === 'parent' && link.key === 'notifications' && unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
            {user?.role !== 'parent' && link.key === 'dashboard' && expiredAlertCount > 0 && (
              <span className="notification-badge dashboard-alert-badge" title="Expired alert">{expiredAlertCount}</span>
            )}
          </NavLink>
        ))}
      </div>
      <div className="sidebar-footer">
        <button type="button" className="btn-secondary" onClick={handleLogout}>{t('logout')}</button>
      </div>
    </aside>
  );
};

export default Sidebar;
