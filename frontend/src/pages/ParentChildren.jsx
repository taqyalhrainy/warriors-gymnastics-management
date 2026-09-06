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

const getUniqueChildren = (children = []) => {
  const byName = new Map();
  children.forEach((child) => {
    const key = String(child?.fullName || child?._id || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) return;
    const current = byName.get(key);
    const currentDate = getDateTime(current?.currentSubscriptionStartedAt || current?.updatedAt);
    const nextDate = getDateTime(child?.currentSubscriptionStartedAt || child?.updatedAt);
    if (!current || nextDate >= currentDate) byName.set(key, child);
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
  const [selectedChild, setSelectedChild] = useState(null);
  const navigate = useNavigate();
  const { t } = useLanguage();
  const children = getUniqueChildren(dashboard?.children || []);

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
            {children.length ? children.map((child) => (
              <button type="button" className="parent-child-summary-card" key={child._id} onClick={() => setSelectedChild(child)}>
                {renderChildName(child)}
                <span className={`parent-status-pill status-${child.status || 'active'}`}>{child.status || t('status')}</span>
                <div><span>{t('paid')}</span><strong>{formatCurrency(child.paidTotal || 0)}</strong></div>
                <div><span>{t('remaining')}</span><strong>{child.remainingAmount != null ? formatCurrency(child.remainingAmount) : '-'}</strong></div>
              </button>
            )) : <div className="parent-panel"><p className="empty-state">{t('noChildRecords')}</p></div>}
          </section>
        )}
        {selectedChild && (
          <div className="parent-child-detail-card">
            <div className="parent-child-detail-head">
              {renderChildName(selectedChild)}
              <button type="button" className="btn-secondary" onClick={() => setSelectedChild(null)}>Close</button>
            </div>
            <div className="parent-child-detail-grid">
              <div><span>{t('program')}</span><strong>{selectedChild.programId?.name || t('notAssigned')}</strong></div>
              <div><span>{t('group')}</span><strong>{getChildGroups(selectedChild) || t('notAssigned')}</strong></div>
              <div><span>{t('coach')}</span><strong>{selectedChild.coachId?.name || t('unassigned')}</strong></div>
              <div><span>{t('status')}</span><strong>{selectedChild.status || '-'}</strong></div>
              <div><span>{t('paid')}</span><strong>{formatCurrency(selectedChild.paidTotal || 0)}</strong></div>
              <div><span>{t('remaining')}</span><strong>{selectedChild.remainingAmount != null ? formatCurrency(selectedChild.remainingAmount) : '-'}</strong></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ParentChildrenPage;
