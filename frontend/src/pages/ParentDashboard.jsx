import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentDashboard } from '../services/parents.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentDashboard = () => {
  const [dashboard, setDashboard] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    fetchParentDashboard().then(setDashboard).catch(console.error);
  }, []);

  const getChildGroups = (child) => {
    const groups = child?.groupIds?.length ? child.groupIds : [child?.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };

  const renderChildName = (child) => (
    <span className="player-name-with-photo">
      <span className="player-avatar">
        {child.profileImage ? <img src={child.profileImage} alt="" /> : <span>{child.fullName?.charAt(0) || '?'}</span>}
      </span>
      <span>{child.fullName}</span>
    </span>
  );

  const children = dashboard?.children || [];
  const payments = dashboard?.payments || [];
  const attendance = dashboard?.attendance || [];
  const notifications = dashboard?.notifications || [];
  const totalRemaining = children.reduce((sum, child) => sum + Number(child.remainingAmount || 0), 0);
  const activeChildren = children.filter((child) => child.status === 'active').length;

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content parent-portal-page">
        <section className="parent-hero">
          <div>
            <span className="parent-kicker">Warriors Gymnastics</span>
            <h1>{t('parentDashboard')}</h1>
          </div>
          <div className="parent-hero-stats">
            <div><span>{t('yourChildren')}</span><strong>{children.length}</strong></div>
            <div><span>{t('status')}</span><strong>{activeChildren}</strong></div>
            <div><span>{t('remaining')}</span><strong>{formatCurrency(totalRemaining)}</strong></div>
          </div>
        </section>

        <section className="parent-child-grid">
          {children.length ? children.map((child) => (
            <article className="parent-child-card" key={child._id}>
              <div className="parent-child-head">
                {renderChildName(child)}
                <span className={`parent-status-pill status-${child.status || 'active'}`}>{child.status || t('status')}</span>
              </div>
              <div className="parent-child-meta">
                <div><span>{t('group')}</span><strong>{getChildGroups(child) || t('notAssigned')}</strong></div>
                <div><span>{t('coach')}</span><strong>{child.coachId?.name || t('unassigned')}</strong></div>
                <div><span>{t('paid')}</span><strong>{child.paidTotal != null ? formatCurrency(child.paidTotal) : formatCurrency(0)}</strong></div>
                <div><span>{t('remaining')}</span><strong>{child.remainingAmount != null ? formatCurrency(child.remainingAmount) : '-'}</strong></div>
              </div>
            </article>
          )) : (
            <div className="parent-panel"><p className="empty-state">{t('noChildRecords')}</p></div>
          )}
        </section>

        <div className="grid-two parent-dashboard-grid">
          <div className="table-card parent-panel">
            <h2>{t('yourChildren')}</h2>
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
          <div className="table-card parent-panel">
            <h2>{t('subscriptionSummary')}</h2>
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
        </div>
        <div className="grid-two parent-dashboard-grid">
          <div className="table-card parent-panel">
            <h2>{t('recentAttendance')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('player')}</th><th>{t('date')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {attendance.length ? attendance.map((note) => (
                  <tr key={note._id}>
                    <td>{note.playerId?.fullName}</td>
                    <td>{new Date(note.date).toLocaleDateString()}</td>
                    <td>{note.status}</td>
                  </tr>
                )) : <tr><td colSpan="3">{t('noRecentAttendance')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-card parent-panel">
            <h2>{t('recentPaymentsNotifications')}</h2>
            <div>
              <h3>{t('payments')}</h3>
              <table className="data-table">
                <thead><tr><th>{t('player')}</th><th>{t('paid')}</th><th>{t('date')}</th></tr></thead>
                <tbody>
                  {payments.length ? payments.slice(0, 5).map((payment) => (
                    <tr key={payment._id}>
                      <td>{payment.playerId?.fullName}</td>
                      <td>{formatCurrency(payment.paidAmount)}</td>
                      <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                    </tr>
                  )) : <tr><td colSpan="3">{t('noPaymentsRecorded')}</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <h3>{t('notifications')}</h3>
              <table className="data-table">
                <thead><tr><th>{t('title')}</th><th>{t('date')}</th></tr></thead>
                <tbody>
                  {notifications.length ? notifications.slice(0, 5).map((note) => (
                    <tr key={note._id}>
                      <td>{note.title}</td>
                      <td>{new Date(note.createdAt).toLocaleDateString()}</td>
                    </tr>
                  )) : <tr><td colSpan="2">{t('noNotificationsYet')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ParentDashboard;
