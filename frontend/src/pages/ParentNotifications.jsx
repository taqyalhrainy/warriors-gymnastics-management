import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { fetchNotifications, getCachedNotificationsPage } from '../services/notifications.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const ParentNotificationsPage = () => {
  const pageSize = 20;
  const firstPageParams = { page: 1, limit: pageSize };
  const cachedFirstPage = getCachedNotificationsPage(firstPageParams);
  const [notifications, setNotifications] = useState(() => cachedFirstPage?.items || []);
  const [isLoading, setIsLoading] = useState(() => !cachedFirstPage);
  const [page, setPage] = useState(() => cachedFirstPage?.page || 1);
  const [total, setTotal] = useState(() => cachedFirstPage?.total || 0);
  const [hasMore, setHasMore] = useState(() => Boolean(cachedFirstPage?.hasMore));
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loadError, setLoadError] = useState('');

  const loadNotifications = (nextPage = 1, append = false) => {
    let isMounted = true;
    setIsLoading(!append && !notifications.length);
    fetchNotifications({ page: nextPage, limit: pageSize })
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setNotifications(data);
          setPage(1);
          setTotal(data.length);
          setHasMore(false);
          return;
        }
        const rows = data?.items || [];
        setNotifications((current) => (append ? [...current, ...rows] : rows));
        setPage(data?.page || nextPage);
        setTotal(data?.total || rows.length);
        setHasMore(Boolean(data?.hasMore));
      })
      .catch(() => { if (isMounted) setLoadError('Unable to load data.'); })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  };

  useEffect(() => {
    const cleanup = loadNotifications(1, false);
    return () => {
      cleanup?.();
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
            <div><span>{t('messages')}</span><strong>{isLoading || (loadError && !notifications.length) ? '...' : `${notifications.length}/${total || notifications.length}`}</strong></div>
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
        <>
        <div className="table-card parent-panel parent-notifications-card">
          <table className="data-table">
            <thead><tr><th></th><th>{t('title')}</th><th>{t('receivedStatus')}</th></tr></thead>
            <tbody>
              {notifications.length ? notifications.map((note) => (
                <tr
                  key={note._id}
                  className="parent-notification-row"
                  onClick={() => navigate(`/parent/notifications/${note._id}`)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/parent/notifications/${note._id}`);
                    }
                  }}
                >
                  <td>{!note.isRead && <span className="parent-notification-alert" aria-label="New message">!</span>}</td>
                  <td>{note.title}</td>
                  <td>{new Date(note.createdAt).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan="3">{t('noNotificationsFound')}</td></tr>}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <div className="show-more-row">
            <button type="button" className="btn-secondary" disabled={isLoading} onClick={() => loadNotifications(page + 1, true)}>
              Show more
            </button>
          </div>
        )}
        </>
        )}
      </main>
    </div>
  );
};

export default ParentNotificationsPage;
