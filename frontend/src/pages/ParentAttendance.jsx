import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentAttendance, getCachedParentAttendance } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : '-');
const formatTime = (date) => (date ? new Date(date).toLocaleTimeString() : '-');
const dateOnly = (date) => {
  const value = new Date(date || 0);
  value.setHours(0, 0, 0, 0);
  return value;
};

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
    groupId: selected?.groupId || fallback?.groupId,
    groupIds: selected?.groupIds?.length ? selected.groupIds : (fallback?.groupIds || []),
    subscriptionId: selected?.subscriptionId || fallback?.subscriptionId
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

const getPackageTitle = (child) => {
  const classes = child.packageClasses || child.subscriptionId?.totalSessions || 0;
  const hours = child.packageHours || '';
  if (classes && hours) return `${classes} classes (${hours} hours)`;
  if (classes) return `${classes} classes`;
  return child.packageName || 'Subscription';
};

const isCurrentRecord = (record, child) => {
  const excludedIds = new Set((child.currentSubscriptionExcludedAttendanceIds || []).map(String));
  if (excludedIds.has(String(record._id))) return false;
  const explicitIds = new Set((child.currentSubscriptionAttendanceIds || []).map(String));
  if (explicitIds.has(String(record._id))) return true;
  const start = child.currentSubscriptionStartedAt || child.startDate || child.subscriptionId?.startDate;
  if (!start) return true;
  return dateOnly(record.date).getTime() >= dateOnly(start).getTime();
};

const ParentAttendancePage = () => {
  const cachedAttendance = getCachedParentAttendance();
  const [children, setChildren] = useState(() => getUniqueParentChildren(cachedAttendance?.children || []));
  const [attendance, setAttendance] = useState(() => cachedAttendance?.attendance || []);
  const [openKey, setOpenKey] = useState('');
  const [isLoading, setIsLoading] = useState(() => !cachedAttendance);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const renderChildName = (child) => (
    <span className="player-name-with-photo">
      <span className="player-avatar">
        {child.profileImage ? <img src={child.profileImage} alt="" /> : <span>{child.fullName?.charAt(0) || '?'}</span>}
      </span>
      <span>{child.fullName}</span>
    </span>
  );

  useEffect(() => {
    let isMounted = true;
    fetchParentAttendance()
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setAttendance(data);
          return;
        }
        setChildren(getUniqueParentChildren(data.children || []));
        setAttendance(data.attendance || []);
      })
      .catch(console.error)
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const packages = useMemo(() => children.flatMap((child) => {
    const childRecords = attendance.filter((record) => String(record.playerId?._id || record.playerId) === String(child._id));
    const currentRecords = childRecords.filter((record) => isCurrentRecord(record, child));
    const oldRecords = childRecords.filter((record) => !isCurrentRecord(record, child));
    const total = Number(child.packageClasses || child.subscriptionId?.totalSessions || 0);
    const currentUsed = currentRecords.filter((record) => record.status === 'present').length;
    const rows = [{
      key: `${child._id}:current`,
      child,
      title: getPackageTitle(child),
      startDate: child.currentSubscriptionStartedAt || child.startDate || child.subscriptionId?.startDate,
      endDate: child.endDate || child.subscriptionId?.endDate,
      used: currentUsed,
      total,
      records: currentRecords,
      current: true
    }];

    if (oldRecords.length) {
      rows.push({
        key: `${child._id}:old`,
        child,
        title: 'Previous attendance',
        startDate: oldRecords[oldRecords.length - 1]?.date,
        endDate: oldRecords[0]?.date,
        used: oldRecords.filter((record) => record.status === 'present').length,
        total: oldRecords.length,
        records: oldRecords,
        current: false
      });
    }

    return rows;
  }), [children, attendance]);

  return (
    <div className="dashboard-layout parent-app-layout">
      <Sidebar />
      <main className="page-content parent-attendance-page">
        <button type="button" className="parent-back-button" onClick={() => navigate('/parent')} aria-label="Back to parent home">
          <span aria-hidden="true">‹</span>
        </button>
        <section className="parent-hero is-compact">
          <div>
            <span className="parent-kicker">Attendance</span>
            <h1>{t('attendanceHistory')}</h1>
          </div>
          <div className="parent-hero-stats">
            <div><span>{t('yourChildren')}</span><strong>{children.length}</strong></div>
            <div><span>{t('classes')}</span><strong>{packages.reduce((sum, item) => sum + Number(item.used || 0), 0)}</strong></div>
          </div>
        </section>
        {isLoading ? (
          <div className="parent-loading-panel">
            <span className="parent-loading-spinner" />
            <strong>Loading attendance...</strong>
          </div>
        ) : (
        <div className="parent-package-list">
          {packages.length ? packages.map((item) => {
            const isOpen = openKey === item.key;
            return (
              <section className="subscription-history-group parent-package-card" key={item.key}>
                <button type="button" className={`subscription-history-summary${item.current ? ' is-current-subscription' : ''}`} onClick={() => setOpenKey(isOpen ? '' : item.key)}>
                  <span>
                    <strong>{renderChildName(item.child)}</strong>
                    <small>{item.title}</small>
                    <small>{formatDate(item.startDate)} - {formatDate(item.endDate)}</small>
                  </span>
                  <b>{item.used}/{item.total || 0}</b>
                </button>
                {isOpen && (
                  <div className="subscription-history-records">
                    {item.records.length ? item.records.map((record) => (
                      <div className={`student-history-row attendance-history-${record.status}`} key={record._id}>
                        <span>{formatDate(record.date)}</span>
                        <strong>{record.status}</strong>
                        <span>{formatTime(record.checkInTime)}</span>
                      </div>
                    )) : <p className="empty-state">{t('noAttendanceRecords')}</p>}
                  </div>
                )}
              </section>
            );
          }) : (
            <div className="table-card"><p className="empty-state">{t('noAttendanceRecords')}</p></div>
          )}
        </div>
        )}
      </main>
    </div>
  );
};

export default ParentAttendancePage;
