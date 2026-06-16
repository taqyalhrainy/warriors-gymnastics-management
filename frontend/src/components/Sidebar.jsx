import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { fetchUnreadCount } from '../services/notifications.js';
import warriorsLogo from '../assets/warriors-logo.png';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const { language, toggleLanguage, t } = useLanguage();
  const { pathname } = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);

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

  const isParentArea = pathname === '/parent' || pathname.startsWith('/parent/');

  const links = isParentArea
    ? [
      { path: '/parent', key: 'dashboard' },
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
      { path: '/payments', key: 'payments' },
      { path: '/notifications', key: 'notifications' },
      { path: '/reports', key: 'reports' },
      { path: '/history', key: 'history' },
      { path: '/audit-logs', key: 'auditLogs' }
    ];

  return (
    <aside className="sidebar">
      <div className="brand-panel">
        <img className="brand-logo" src={warriorsLogo} alt="Warriors Gymnastics Academy" />
        <div className="brand-name">{t('appName')}</div>
      </div>
      <div className="sidebar-links">
        {links.map((link) => (
          <NavLink key={link.path} to={link.path} className={({ isActive }) => isActive ? 'active' : ''}>
            <span>{t(link.key)}</span>
            {user?.role === 'parent' && link.key === 'notifications' && unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </NavLink>
        ))}
      </div>
      <div className="sidebar-footer">
        <button type="button" className="btn-secondary" onClick={logout}>{t('logout')}</button>
      </div>
    </aside>
  );
};

export default Sidebar;
