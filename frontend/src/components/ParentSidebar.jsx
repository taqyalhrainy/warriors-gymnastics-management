import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { fetchUnreadCount } from '../services/notifications.js';
import warriorsLogo from '../assets/warriors-logo.png';

const ParentSidebar = () => {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
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

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to log out?')) {
      logout();
      navigate('/parent/login', { replace: true });
    }
  };

  const links = [
    { path: '/parent', key: 'home', label: 'Home' },
    { path: '/parent/attendance', key: 'attendance' },
    { path: '/parent/payments', key: 'payments' },
    { path: '/parent/notifications', key: 'notifications' }
  ];

  return (
    <aside className="sidebar parent-sidebar">
      <div className="brand-panel">
        <img className="brand-logo" src={warriorsLogo} alt="Warriors Gymnastics Academy" />
        <div className="brand-name">{t('appName')}</div>
      </div>
      <div className="sidebar-links">
        {links.map((link) => (
          <NavLink key={link.path} to={link.path} className={({ isActive }) => isActive ? 'active' : ''}>
            <span>{link.label || t(link.key)}</span>
            {link.key === 'notifications' && unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
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

export default ParentSidebar;
