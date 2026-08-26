import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentAttendance } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const formatDate = (date) => (date ? new Date(date).toLocaleDateString() : '-');
const formatTime = (date) => (date ? new Date(date).toLocaleTimeString() : '-');
const dateOnly = (date) => {
  const value = new Date(date || 0);
  value.setHours(0, 0, 0, 0);
  return value;
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
  const [children, setChildren] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [openKey, setOpenKey] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    fetchParentAttendance()
      .then((data) => {
        if (Array.isArray(data)) {
          setAttendance(data);
          return;
        }
        setChildren(data.children || []);
        setAttendance(data.attendance || []);
      })
      .catch(console.error);
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
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content parent-attendance-page">
        <div className="page-header"><h1>{t('attendanceHistory')}</h1></div>
        <div className="parent-package-list">
          {packages.length ? packages.map((item) => {
            const isOpen = openKey === item.key;
            return (
              <section className="subscription-history-group parent-package-card" key={item.key}>
                <button type="button" className={`subscription-history-summary${item.current ? ' is-current-subscription' : ''}`} onClick={() => setOpenKey(isOpen ? '' : item.key)}>
                  <span>
                    <strong>{item.child.fullName}</strong>
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
      </main>
    </div>
  );
};

export default ParentAttendancePage;
