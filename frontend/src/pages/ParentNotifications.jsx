import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { fetchNotifications, getCachedNotifications } from '../services/notifications.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const ParentNotificationsPage = () => {
  const [notifications, setNotifications] = useState(() => getCachedNotifications() || []);
  const [isLoading, setIsLoading] = useState(() => !getCachedNotifications());
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let isMounted = true;
    fetchNotifications()
      .then((data) => {
        if (isMounted) setNotifications(data);
      })
      .catch(() => { if (isMounted) setLoadError('Unable to load data.'); })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="dashboard-layout parent-app-layout">
      <Sidebar />
      <main className="page-content parent-portal-page">
        <button type="button" className="parent-back-button" onClick={() => navigate('/parent')} aria-label="Back to parent home">
          <span aria-hidden="true">‹</span>
        </button>
        <section className="parent-hero is-compact">
          <div>
            <span className="parent-kicker">Messages</span>
            <h1>{t('notifications')}</h1>
          </div>
          <div className="parent-hero-stats">
            <div><span>{t('messages')}</span><strong>{isLoading || (loadError && !notifications.length) ? '...' : notifications.length}</strong></div>
            <div><span>New</span><strong>{isLoading || (loadError && !notifications.length) ? '...' : notifications.filter((note) => !note.isRead).length}</strong></div>
          </div>
        </section>
        {loadError && !notifications.length ? <DataStatus state={{ error: loadError }} /> : isLoading ? (
          <div className="parent-loading-panel">
            <img src={warriorsLogo} alt="" />
            <span className="parent-loading-spinner" />
            <strong>Loading notifications...</strong>
          </div>
        ) : (
        <div className="table-card parent-panel parent-notifications-card">
          <table className="data-table">
            <thead><tr><th></th><th>{t('title')}</th><th>{t('receivedStatus')}</th><th>{t('action')}</th></tr></thead>
            <tbody>
              {notifications.length ? notifications.map((note) => (
                <tr key={note._id}>
                  <td>{!note.isRead && <span className="parent-notification-alert" aria-label="New message">!</span>}</td>
                  <td>{note.title}</td>
                  <td>{new Date(note.createdAt).toLocaleString()}</td>
                  <td><Link className="parent-open-link" to={`/parent/notifications/${note._id}`}>{t('open')}</Link></td>
                </tr>
              )) : <tr><td colSpan="4">{t('noNotificationsFound')}</td></tr>}
            </tbody>
          </table>
        </div>
        )}
      </main>
    </div>
  );
};

export default ParentNotificationsPage;
