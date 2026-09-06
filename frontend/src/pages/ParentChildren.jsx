import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentDashboard, getCachedParentDashboard } from '../services/parents.js';
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
          <div className="table-card parent-panel">
            <table className="data-table">
              <thead><tr><th>{t('name')}</th><th>{t('program')}</th><th>{t('group')}</th><th>{t('coach')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {children.length ? children.map((child) => (
                  <tr key={child._id}>
                    <td>{renderChildName(child)}</td>
                    <td>{child.programId?.name || t('notAssigned')}</td>
                    <td>{getChildGroups(child) || t('notAssigned')}</td>
                    <td>{child.coachId?.name || t('unassigned')}</td>
                    <td>{child.status}</td>
                  </tr>
                )) : <tr><td colSpan="5">{t('noChildRecords')}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default ParentChildrenPage;
