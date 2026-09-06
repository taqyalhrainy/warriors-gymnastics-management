import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchNotificationById } from '../services/notifications.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const NotificationDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState('');
  const { t } = useLanguage();

  const backPath = location.pathname.startsWith('/parent') ? '/parent/notifications' : '/notifications';

  useEffect(() => {
    const loadNotification = async () => {
      try {
        const note = await fetchNotificationById(id);
        setNotification(note);
        window.dispatchEvent(new Event('notifications:changed'));
      } catch (err) {
        setError(err.response?.data?.message || 'Unable to load notification.');
      }
    };

    loadNotification();
  }, [id]);

  const isParentArea = location.pathname.startsWith('/parent');

  return (
    <div className={`dashboard-layout${isParentArea ? ' parent-app-layout' : ''}`}>
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('notification')}</h1>
          <button className="btn-secondary" type="button" onClick={() => navigate(backPath)}>{t('back')}</button>
        </div>
        {error && <p className="alert-error">{error}</p>}
        {notification ? (
          <div className="details-card">
            <h2>{notification.title}</h2>
            <p>{notification.message}</p>
            <div style={{ marginTop: '16px', color: '#6b7280' }}>
              <p>{t('type')}: {notification.type || t('general')}</p>
              <p>{t('received')}: {new Date(notification.createdAt).toLocaleString()}</p>
              {notification.viewedAt && <p>{t('userSawMessageAt')} {new Date(notification.viewedAt).toLocaleString()}</p>}
            </div>
          </div>
        ) : !error ? (
          <p>{t('loadingNotification')}</p>
        ) : null}
      </main>
    </div>
  );
};

export default NotificationDetailPage;
