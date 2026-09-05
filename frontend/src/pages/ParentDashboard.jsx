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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('parentDashboard')}</h1></div>
        <div className="grid-two">
          <div className="table-card">
            <h2>{t('yourChildren')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('name')}</th><th>{t('program')}</th><th>{t('group')}</th><th>{t('coach')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {dashboard?.children?.length ? dashboard.children.map((child) => (
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
          <div className="table-card">
            <h2>{t('subscriptionSummary')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('child')}</th><th>{t('status')}</th><th>{t('paid')}</th><th>{t('remaining')}</th><th>{t('daysRemaining')}</th></tr></thead>
              <tbody>
                {dashboard?.children?.length ? dashboard.children.map((child) => (
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
        <div className="grid-two">
          <div className="table-card">
            <h2>{t('recentAttendance')}</h2>
            <table className="data-table">
              <thead><tr><th>{t('player')}</th><th>{t('date')}</th><th>{t('status')}</th></tr></thead>
              <tbody>
                {dashboard?.attendance?.length ? dashboard.attendance.map((note) => (
                  <tr key={note._id}>
                    <td>{note.playerId?.fullName}</td>
                    <td>{new Date(note.date).toLocaleDateString()}</td>
                    <td>{note.status}</td>
                  </tr>
                )) : <tr><td colSpan="3">{t('noRecentAttendance')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-card">
            <h2>{t('recentPaymentsNotifications')}</h2>
            <div>
              <h3>{t('payments')}</h3>
              <table className="data-table">
                <thead><tr><th>{t('player')}</th><th>{t('paid')}</th><th>{t('date')}</th></tr></thead>
                <tbody>
                  {dashboard?.payments?.length ? dashboard.payments.slice(0, 5).map((payment) => (
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
                  {dashboard?.notifications?.length ? dashboard.notifications.slice(0, 5).map((note) => (
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
