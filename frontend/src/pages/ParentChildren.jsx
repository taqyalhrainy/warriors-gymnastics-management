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

const getChildGroups = (child) => {
  const groups = child?.groupIds?.length ? child.groupIds : [child?.groupId].filter(Boolean);
  return groups.map((group) => group?.name).filter(Boolean).join(', ');
};

const ParentChildrenPage = () => {
  const cached = getCachedParentDashboard();
  const [dashboard, setDashboard] = useState(() => cached || null);
  const [isLoading, setIsLoading] = useState(() => !cached);
  const [selectedChildId, setSelectedChildId] = useState('');
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

  const renderChildName = (child) => (
    <span className="player-name-with-photo">
      <span className="player-avatar">
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
            <h1>{t('yourChildren')}</h1>
          </div>
        </section>
        {isLoading ? (
          <div className="parent-loading-panel"><span className="parent-loading-spinner" /><strong>Loading children...</strong></div>
        ) : (
          <section className="parent-children-list">
            {children.length ? children.map((child) => {
              const isSelected = selectedChildId === child._id;
              return (
                <div className="parent-child-summary-wrap" key={child._id}>
                  <button type="button" className="parent-child-summary-card" onClick={() => setSelectedChildId(isSelected ? '' : child._id)}>
                    {renderChildName(child)}
                    <span className={`parent-status-pill status-${child.status || 'active'}`}>{child.status || t('status')}</span>
                    <div><span>{t('paid')}</span><strong>{formatCurrency(child.paidTotal || 0)}</strong></div>
                    <div><span>{t('remaining')}</span><strong>{child.remainingAmount != null ? formatCurrency(child.remainingAmount) : '-'}</strong></div>
                  </button>
                  {isSelected && (
                    <div className="parent-child-detail-card">
                      <div className="parent-child-detail-grid">
                        <div><span>{t('program')}</span><strong>{child.programId?.name || t('notAssigned')}</strong></div>
                        <div><span>{t('group')}</span><strong>{getChildGroups(child) || t('notAssigned')}</strong></div>
                        <div><span>{t('coach')}</span><strong>{child.coachId?.name || t('unassigned')}</strong></div>
                        <div><span>{t('status')}</span><strong>{child.status || '-'}</strong></div>
                        <div><span>{t('paid')}</span><strong>{formatCurrency(child.paidTotal || 0)}</strong></div>
                        <div><span>{t('remaining')}</span><strong>{child.remainingAmount != null ? formatCurrency(child.remainingAmount) : '-'}</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            }) : <div className="parent-panel"><p className="empty-state">{t('noChildRecords')}</p></div>}
          </section>
        )}
      </main>
    </div>
  );
};

export default ParentChildrenPage;
