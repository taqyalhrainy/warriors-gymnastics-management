import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentDashboard } from '../services/parents.js';
import { formatCurrency } from '../utils/format.js';

const ParentDashboard = () => {
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    fetchParentDashboard().then(setDashboard).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Parent Dashboard</h1></div>
        <div className="grid-two">
          <div className="table-card">
            <h2>Your Children</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Program</th><th>Group</th><th>Coach</th><th>Status</th></tr></thead>
              <tbody>
                {dashboard?.children?.length ? dashboard.children.map((child) => (
                  <tr key={child._id}>
                    <td>{child.fullName}</td>
                    <td>{child.programId?.name || 'Not assigned'}</td>
                    <td>{child.groupId?.name || 'Not assigned'}</td>
                    <td>{child.coachId?.name || 'Unassigned'}</td>
                    <td>{child.status}</td>
                  </tr>
                )) : <tr><td colSpan="5">No child records available.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-card">
            <h2>Subscription Summary</h2>
            <table className="data-table">
              <thead><tr><th>Child</th><th>Status</th><th>Paid</th><th>Remaining</th><th>Days Remaining</th></tr></thead>
              <tbody>
                {dashboard?.children?.length ? dashboard.children.map((child) => (
                  <tr key={child._id}>
                    <td>{child.fullName}</td>
                    <td>{child.subscriptionId?.status || 'N/A'}</td>
                    <td>{child.paidTotal != null ? formatCurrency(child.paidTotal) : formatCurrency(0)}</td>
                    <td>{child.remainingAmount != null ? formatCurrency(child.remainingAmount) : '—'}</td>
                    <td>{child.daysRemaining != null ? `${child.daysRemaining} days` : '—'}</td>
                  </tr>
                )) : <tr><td colSpan="5">No subscription data available.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="grid-two">
          <div className="table-card">
            <h2>Recent Attendance</h2>
            <table className="data-table">
              <thead><tr><th>Player</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {dashboard?.attendance?.length ? dashboard.attendance.map((note) => (
                  <tr key={note._id}>
                    <td>{note.playerId?.fullName}</td>
                    <td>{new Date(note.date).toLocaleDateString()}</td>
                    <td>{note.status}</td>
                  </tr>
                )) : <tr><td colSpan="3">No recent attendance records.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-card">
            <h2>Recent Payments & Notifications</h2>
            <div>
              <h3>Payments</h3>
              <table className="data-table">
                <thead><tr><th>Player</th><th>Paid</th><th>Date</th></tr></thead>
                <tbody>
                  {dashboard?.payments?.length ? dashboard.payments.slice(0, 5).map((payment) => (
                    <tr key={payment._id}>
                      <td>{payment.playerId?.fullName}</td>
                      <td>{formatCurrency(payment.paidAmount)}</td>
                      <td>{new Date(payment.paymentDate).toLocaleDateString()}</td>
                    </tr>
                  )) : <tr><td colSpan="3">No payments recorded.</td></tr>}
                </tbody>
              </table>
            </div>
            <div>
              <h3>Notifications</h3>
              <table className="data-table">
                <thead><tr><th>Title</th><th>Date</th></tr></thead>
                <tbody>
                  {dashboard?.notifications?.length ? dashboard.notifications.slice(0, 5).map((note) => (
                    <tr key={note._id}>
                      <td>{note.title}</td>
                      <td>{new Date(note.createdAt).toLocaleDateString()}</td>
                    </tr>
                  )) : <tr><td colSpan="2">No notifications yet.</td></tr>}
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
