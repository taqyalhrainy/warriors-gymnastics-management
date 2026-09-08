import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentDashboard, getCachedParentDashboard } from '../services/parents.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const getDateTime = (date) => {
  const value = new Date(date || 0).getTime();
  return Number.isNaN(value) ? 0 : value;
};

const getChildPriority = (child) => {
  const status = child?.status || 'active';
  const statusScore = status === 'active' ? 4 : status === 'tryout' ? 3 : status === 'frozen' ? 2 : status === 'expired' ? 1 : 0;
  const dateScore = Math.max(
    getDateTime(child?.currentSubscriptionStartedAt),
    getDateTime(child?.startDate),
    getDateTime(child?.updatedAt),
    getDateTime(child?.createdAt)
  );
  return { statusScore, dateScore };
};

const getUniqueParentChildren = (children = []) => {
  const byName = new Map();

  const mergeChildDetails = (selected, fallback) => ({
    ...selected,
    profileImage: selected?.profileImage || fallback?.profileImage || '',
    dateOfBirth: selected?.dateOfBirth || fallback?.dateOfBirth || '',
    programId: selected?.programId || fallback?.programId,
    coachId: selected?.coachId || fallback?.coachId,
    groupId: selected?.groupId || fallback?.groupId,
    groupIds: selected?.groupIds?.length ? selected.groupIds : (fallback?.groupIds || [])
  });

  children.forEach((child) => {
    const key = String(child?.fullName || child?._id || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return;

    const current = byName.get(key);
    if (!current) {
      byName.set(key, child);
      return;
    }

    const nextPriority = getChildPriority(child);
    const currentPriority = getChildPriority(current);
    if (
      nextPriority.statusScore > currentPriority.statusScore
      || (nextPriority.statusScore === currentPriority.statusScore && nextPriority.dateScore >= currentPriority.dateScore)
    ) {
      byName.set(key, mergeChildDetails(child, current));
    } else {
      byName.set(key, mergeChildDetails(current, child));
    }
  });

  return [...byName.values()];
};

const getVisibleRemaining = (child) => child?.attendanceDueManual ? Number(child.remainingAmount || 0) : 0;

const ParentDashboard = () => {
  const [dashboard, setDashboard] = useState(() => getCachedParentDashboard() || null);
  const [isLoading, setIsLoading] = useState(() => !getCachedParentDashboard());
  const [previewProfileImage, setPreviewProfileImage] = useState('');
  const { t } = useLanguage();
  const { user } = useAuth();

  useEffect(() => {
    let isMounted = true;
    fetchParentDashboard({ force: true })
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

  const children = getUniqueParentChildren(dashboard?.children || []).filter((child) => child.status !== 'left');
  const notifications = dashboard?.notifications || [];
  const totalRemaining = children.reduce((sum, child) => sum + getVisibleRemaining(child), 0);
  const activeChildren = children.filter((child) => child.status === 'active').length;
  const getChildGroups = (child) => {
    const groups = child?.groupIds?.length ? child.groupIds : [child?.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };
  const openProfileImage = (event, image) => {
    if (!image) return;
    event.preventDefault();
    event.stopPropagation();
    setPreviewProfileImage(image);
  };
  const handleProfileImageKeyDown = (event, image) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
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
  const appTiles = [
    { path: '/parent/attendance', label: t('attendance'), icon: 'attendance' },
    { path: '/parent/payments', label: t('payments'), icon: 'payments' },
    { path: '/parent/notifications', label: t('notifications'), icon: 'notifications', badge: notifications.filter((note) => !note.isRead).length },
    { path: '/parent/settings', label: 'Settings', icon: 'settings' },
    { path: '/parent/children', label: t('yourChildren'), icon: 'children', badge: children.length },
    { path: '/parent/subscriptions', label: t('subscriptionSummary'), icon: 'subscription' }
  ];

  return (
    <div className="dashboard-layout parent-app-layout">
      <Sidebar />
      <main className="page-content parent-portal-page">
        <section className="parent-app-hero" style={{ '--parent-hero-image': `url(${warriorsLogo})` }}>
          <div className="parent-app-hero-brand">
            <img src={warriorsLogo} alt="" />
          </div>
          <div className="parent-app-hero-copy">
            <span className="parent-kicker">Warriors Gymnastics</span>
            <h1>Welcome</h1>
            <p>{user?.name || t('parentDashboard')}</p>
          </div>
        </section>

        {isLoading ? (
          <div className="parent-loading-panel">
            <img src={warriorsLogo} alt="" />
            <span className="parent-loading-spinner" />
            <strong>Loading parent data...</strong>
          </div>
        ) : (
        <>
        <section className="parent-app-tile-grid" aria-label="Parent navigation">
          {appTiles.map((tile) => (
            <Link className="parent-app-tile" to={tile.path} key={tile.label}>
              <span className={`parent-app-icon is-${tile.icon}`} aria-hidden="true" />
              <strong>{tile.label}</strong>
              {tile.badge > 0 && <em>{tile.badge}</em>}
            </Link>
          ))}
        </section>
        <section className="parent-hero parent-dashboard-strip">
          <div>
            <span className="parent-kicker">Overview</span>
            <h1>{t('parentDashboard')}</h1>
          </div>
          <div className="parent-hero-stats">
            <div><span>{t('yourChildren')}</span><strong>{children.length}</strong></div>
            <div><span>{t('status')}</span><strong>{activeChildren}</strong></div>
            <div><span>{t('remaining')}</span><strong>{formatCurrency(totalRemaining)}</strong></div>
          </div>
        </section>
        <section className="parent-child-grid parent-dashboard-grid">
          {children.length ? children.map((child) => (
            <Link className="parent-child-card" to="/parent/children" key={child._id}>
              <div className="parent-child-head">
                {renderChildName(child)}
                <span className={`parent-status-pill status-${child.status || 'active'}`}>{child.status || t('status')}</span>
              </div>
              <div className="parent-child-meta">
                <div><span>{t('group')}</span><strong>{getChildGroups(child) || t('notAssigned')}</strong></div>
                <div><span>{t('paid')}</span><strong>{formatCurrency(child.paidTotal || 0)}</strong></div>
                <div><span>{t('remaining')}</span><strong>{formatCurrency(getVisibleRemaining(child))}</strong></div>
                <div><span>{t('status')}</span><strong>{child.subscriptionId?.status || child.status || '-'}</strong></div>
              </div>
            </Link>
          )) : (
            <section className="parent-panel"><p className="empty-state">{t('noChildRecords')}</p></section>
          )}
        </section>
        </>
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

export default ParentDashboard;
