import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentDashboard, getCachedParentDashboard } from '../services/parents.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const getDateTime = (date) => {
  const value = new Date(date || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const getStatusScore = (status) => {
  const normalized = String(status || 'active').toLowerCase();
  if (normalized === 'active') return 5;
  if (normalized === 'tryout') return 4;
  if (normalized === 'frozen') return 3;
  if (normalized === 'expired') return 2;
  if (normalized === 'left') return 0;
  return 1;
};

const getUniqueChildren = (children = []) => {
  const byName = new Map();
  const mergeChild = (selected, fallback) => ({
    ...selected,
    profileImage: selected?.profileImage || fallback?.profileImage || ''
  });

  children.forEach((child) => {
    const key = String(child?.fullName || child?._id || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return;
    const current = byName.get(key);
    const currentScore = getStatusScore(current?.status);
    const nextScore = getStatusScore(child?.status);
    const currentDate = getDateTime(current?.currentSubscriptionStartedAt || current?.updatedAt || current?.createdAt);
    const nextDate = getDateTime(child?.currentSubscriptionStartedAt || child?.updatedAt || child?.createdAt);
    if (!current || nextScore > currentScore || (nextScore === currentScore && nextDate >= currentDate)) {
      byName.set(key, mergeChild(child, current));
    } else {
      byName.set(key, mergeChild(current, child));
    }
  });
  return [...byName.values()];
};

const ParentSubscriptionSummaryPage = () => {
  const cached = getCachedParentDashboard();
  const [dashboard, setDashboard] = useState(() => cached || null);
  const [isLoading, setIsLoading] = useState(() => !cached);
  const [previewProfileImage, setPreviewProfileImage] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();
  const children = getUniqueChildren(dashboard?.children || []).filter((child) => child.status !== 'left');

  useEffect(() => {
    let isMounted = true;
    fetchParentDashboard()
      .then((data) => {
        if (isMounted) setDashboard(data);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const openProfileImage = (event, image) => {
    if (!image) return;
    event.stopPropagation();
    setPreviewProfileImage(image);
  };

  const handleProfileImageKeyDown = (event, image) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openProfileImage(event, image);
  };

  const renderChildName = (child) => (
    <span className="player-name-with-photo">
      <span
        className={`player-avatar${child.profileImage ? ' is-clickable' : ''}`}
        role={child.profileImage ? 'button' : undefined}
        tabIndex={child.profileImage ? 0 : undefined}
        onClick={(event) => openProfileImage(event, child.profileImage)}
        onKeyDown={(event) => handleProfileImageKeyDown(event, child.profileImage)}
      >
        {child.profileImage ? <img src={child.profileImage} alt="" /> : <span>{child.fullName?.charAt(0) || '?'}</span>}
      </span>
      <span>{child.fullName}</span>
    </span>
  );

  return (
    <div className="dashboard-layout parent-app-layout">
      <Sidebar />
      <main className="page-content parent-portal-page">
        <button type="button" className="parent-back-button" onClick={() => navigate('/parent')} aria-label="Back to parent home">
          <span aria-hidden="true">&lsaquo;</span>
        </button>
        <section className="parent-hero is-compact">
          <div>
            <span className="parent-kicker">Parent app</span>
            <h1>{t('subscriptionSummary')}</h1>
          </div>
        </section>
        {isLoading ? (
          <div className="parent-loading-panel"><span className="parent-loading-spinner" /><strong>Loading subscriptions...</strong></div>
        ) : (
          <div className="table-card parent-panel">
            <table className="data-table">
              <thead><tr><th>{t('child')}</th><th>{t('status')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('daysRemaining')}</th></tr></thead>
              <tbody>
                {children.length ? children.map((child) => (
                  <tr key={child._id}>
                    <td>{renderChildName(child)}</td>
                    <td>{child.subscriptionId?.status || t('notAvailable')}</td>
                    <td>{child.paidTotal != null ? formatCurrency(child.paidTotal) : formatCurrency(0)}</td>
                    <td>{child.remainingAmount != null ? formatCurrency(child.remainingAmount) : '-'}</td>
                    <td>{child.daysRemaining != null ? child.daysRemaining : '-'}</td>
                  </tr>
                )) : <tr><td colSpan="5">{t('noSubscriptionData')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {previewProfileImage && (
          <div className="profile-image-preview-backdrop" role="presentation" onClick={() => setPreviewProfileImage('')}>
            <section className="profile-image-preview-dialog" role="dialog" aria-modal="true" aria-label="Profile picture preview" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="btn-secondary" onClick={() => setPreviewProfileImage('')}>{t('close')}</button>
              <img src={previewProfileImage} alt="" />
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default ParentSubscriptionSummaryPage;
