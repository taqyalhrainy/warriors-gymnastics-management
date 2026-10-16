import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ParentSidebar from '../components/ParentSidebar.jsx';
import { fetchNotificationById } from '../services/notifications.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const ParentNotificationDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    let active = true;
    setNotification(null);
    setError('');
    fetchNotificationById(id)
      .then((note) => {
        if (!active) return;
        setNotification(note);
        window.dispatchEvent(new Event('notifications:changed'));
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Unable to load notification.');
      });
    return () => { active = false; };
  }, [id]);

  return (
    <div className="dashboard-layout parent-app-layout">
      <ParentSidebar />
      <main className="page-content parent-portal-page">
        <div className="page-header">
          <h1>{t('notification')}</h1>
          <button className="parent-back-button" type="button" onClick={() => navigate('/parent/notifications')} aria-label={t('back')}>
            <span aria-hidden="true">&lsaquo;</span>
          </button>
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
          <div className="parent-loading-panel">
            <img src={warriorsLogo} alt="" />
            <span className="parent-loading-spinner" />
            <strong>{t('loadingNotification')}</strong>
          </div>
        ) : null}
      </main>
    </div>
  );
};

export default ParentNotificationDetailPage;
