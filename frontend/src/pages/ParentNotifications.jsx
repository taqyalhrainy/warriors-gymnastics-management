import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchNotifications, getCachedNotifications } from '../services/notifications.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentNotificationsPage = () => {
  const [notifications, setNotifications] = useState(() => getCachedNotifications() || []);
  const [isLoading, setIsLoading] = useState(() => !getCachedNotifications());
  const { t } = useLanguage();

  useEffect(() => {
    let isMounted = true;
    fetchNotifications()
      .then((data) => {
        if (isMounted) setNotifications(data);
      })
      .catch(console.error)
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
        <section className="parent-hero is-compact">
          <div>
            <span className="parent-kicker">Messages</span>
            <h1>{t('notifications')}</h1>
          </div>
          <div className="parent-hero-stats">
            <div><span>{t('unreadStatus')}</span><strong>{notifications.filter((note) => !note.isRead).length}</strong></div>
            <div><span>{t('readStatus')}</span><strong>{notifications.filter((note) => note.isRead).length}</strong></div>
          </div>
        </section>
        {isLoading ? (
          <div className="parent-loading-panel">
            <span className="parent-loading-spinner" />
            <strong>Loading notifications...</strong>
          </div>
        ) : (
        <div className="table-card parent-panel parent-notifications-card">
          <table className="data-table">
            <thead><tr><th>{t('title')}</th><th>{t('receivedStatus')}</th><th>{t('status')}</th><th>{t('action')}</th></tr></thead>
            <tbody>
              {notifications.length ? notifications.map((note) => (
                <tr key={note._id}>
                  <td>{note.title}</td>
                  <td>{new Date(note.createdAt).toLocaleString()}</td>
                  <td>{note.isRead ? t('readStatus') : t('unreadStatus')}</td>
                  <td><Link to={`/parent/notifications/${note._id}`}>{t('open')}</Link></td>
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
