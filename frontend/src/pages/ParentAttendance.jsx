import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentAttendance, fetchParentAttendanceHistory, getCachedParentAttendance } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import warriorsLogo from '../assets/warriors-logo.png';

const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : '-');
const formatTime = (date) => (date ? new Date(date).toLocaleTimeString() : '-');
const getDateInputValue = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};
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
    attendancePlayerIds: [
      ...new Set([
        selected?._id,
        ...(selected?.attendancePlayerIds || []),
        fallback?._id,
        ...(fallback?.attendancePlayerIds || [])
      ].filter(Boolean).map(String))
    ],
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
      byName.set(key, { ...child, attendancePlayerIds: [String(child._id)] });
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

const getCurrentSubscriptionCycleKey = (child) => getDateInputValue(child.currentSubscriptionStartedAt || child.startDate || child.subscriptionId?.startDate);

const getAttendanceRecordsForSubscription = (records, child, cycle, cycles) => {
  const sortedAsc = [...cycles].sort((first, second) => new Date(first.startDate) - new Date(second.startDate));
  const cycleIndex = sortedAsc.findIndex((item) => item.key === cycle.key);
  const nextCycle = sortedAsc[cycleIndex + 1];
  const startTime = dateOnly(cycle.startDate).getTime();
  const nextStartTime = nextCycle ? dateOnly(nextCycle.startDate).getTime() : null;
  const currentCycleKey = getCurrentSubscriptionCycleKey(child);
  const isCurrentCycle = cycle.key === currentCycleKey;
  const explicitIds = new Set((child.currentSubscriptionAttendanceIds || []).map(String));

  return records.filter((record) => {
    if (explicitIds.has(String(record._id))) {
      return isCurrentCycle;
    }
    const recordTime = dateOnly(record.date).getTime();
    return recordTime >= startTime && (!nextStartTime || recordTime < nextStartTime);
  });
};

const ParentAttendancePage = () => {
  const cachedAttendance = getCachedParentAttendance();
  const [children, setChildren] = useState(() => getUniqueParentChildren(cachedAttendance?.children || []).filter((child) => child.status !== 'left'));
  const [attendance, setAttendance] = useState(() => cachedAttendance?.attendance || []);
  const [openChildId, setOpenChildId] = useState('');
  const [openClassKey, setOpenClassKey] = useState('');
  const [isLoading, setIsLoading] = useState(() => !cachedAttendance);
  const [previewProfileImage, setPreviewProfileImage] = useState('');
  const [historyByChildId, setHistoryByChildId] = useState({});
  const [loadingHistoryChildId, setLoadingHistoryChildId] = useState('');
  const navigate = useNavigate();
  const { t } = useLanguage();

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

  const loadChildHistory = (childId) => {
    if (!childId || historyByChildId[childId] || loadingHistoryChildId === childId) return;
    setLoadingHistoryChildId(childId);
    fetchParentAttendanceHistory(childId)
      .then((data) => {
        setHistoryByChildId((current) => ({ ...current, [childId]: data.subscriptionHistory || [] }));
      })
      .catch(console.error)
      .finally(() => setLoadingHistoryChildId(''));
  };

  useEffect(() => {
    let isMounted = true;
    fetchParentAttendance()
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setAttendance(data);
          return;
        }
        setChildren(getUniqueParentChildren(data.children || []).filter((child) => child.status !== 'left'));
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

  const packagesByChild = useMemo(() => new Map(children.map((child) => {
    const childIdSet = new Set((child.attendancePlayerIds?.length ? child.attendancePlayerIds : [child._id]).map(String));
    const childRecords = attendance.filter((record) => childIdSet.has(String(record.playerId?._id || record.playerId)));
    const currentCycleKey = getCurrentSubscriptionCycleKey(child);
    const loadedHistory = historyByChildId[String(child._id)] || [];
    const historyCycles = loadedHistory.length
      ? loadedHistory
      : child.subscriptionHistory?.length
      ? child.subscriptionHistory
      : [{
        key: currentCycleKey || `${child._id}:current`,
        startDate: child.currentSubscriptionStartedAt || child.startDate || child.subscriptionId?.startDate,
        endDate: child.endDate || child.subscriptionId?.endDate,
        packageName: getPackageTitle(child),
        packageClasses: Number(child.packageClasses || child.subscriptionId?.totalSessions || 0),
        packageHours: Number(child.packageHours || 0)
      }];

    const rows = historyCycles.map((cycle) => {
      const records = getAttendanceRecordsForSubscription(childRecords, child, cycle, historyCycles);
      const current = cycle.key === currentCycleKey;
      const used = current
        ? Number(child.attendancePresentCount ?? records.filter((record) => record.status === 'present' && isCurrentRecord(record, child)).length)
        : records.filter((record) => record.status === 'present').length;
      return {
        key: `${child._id}:${cycle.key}`,
        child,
        title: cycle.packageName || 'Subscription',
        startDate: cycle.startDate,
        endDate: cycle.endDate,
        used,
        total: Number(cycle.packageClasses || 0),
        records,
        current
      };
    });

    return [String(child._id), rows];
  })), [children, attendance, historyByChildId]);
  const totalUsed = [...packagesByChild.values()]
    .flat()
    .reduce((sum, item) => sum + Number(item.used || 0), 0);

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
            <div><span>{t('classes')}</span><strong>{totalUsed}</strong></div>
          </div>
        </section>
        {isLoading ? (
          <div className="parent-loading-panel">
            <img src={warriorsLogo} alt="" />
            <span className="parent-loading-spinner" />
            <strong>Loading attendance...</strong>
          </div>
        ) : (
        <div className="parent-attendance-player-list">
          {children.length ? children.map((child) => {
            const childPackages = packagesByChild.get(String(child._id)) || [];
            const isChildOpen = openChildId === String(child._id);
            return (
              <section className="parent-attendance-player-card" key={child._id}>
                <button
                  type="button"
                  className="parent-attendance-player-summary"
                  onClick={() => {
                    const childId = String(child._id);
                    setOpenChildId(isChildOpen ? '' : childId);
                    setOpenClassKey('');
                    if (!isChildOpen) loadChildHistory(childId);
                  }}
                >
                  {renderChildName(child)}
                  <b>Click here</b>
                </button>
                {isChildOpen && (
                  <div className="parent-attendance-class-list">
                    {loadingHistoryChildId === String(child._id) && <p className="empty-state">Loading classes...</p>}
                    {childPackages.map((item) => {
                      const isClassOpen = openClassKey === item.key;
                      return (
                        <section className="subscription-history-group parent-package-card" key={item.key}>
                          <button type="button" className={`subscription-history-summary${item.current ? ' is-current-subscription' : ''}`} onClick={() => setOpenClassKey(isClassOpen ? '' : item.key)}>
                            <span>
                              <strong>{item.title}</strong>
                              <small>{formatDate(item.startDate)} - {formatDate(item.endDate)}</small>
                            </span>
                            <b>{item.used}/{item.total || 0}</b>
                          </button>
                          {isClassOpen && (
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
                    })}
                  </div>
                )}
              </section>
            );
          }) : (
            <div className="table-card"><p className="empty-state">{t('noAttendanceRecords')}</p></div>
          )}
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

export default ParentAttendancePage;
