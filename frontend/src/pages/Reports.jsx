import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchDashboard, fetchRevenue, fetchAttendanceReport } from '../services/reports.js';
import StatsCard from '../components/StatsCard.jsx';

const ReportsPage = () => {
  const [dashboard, setDashboard] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    fetchDashboard().then(setDashboard).catch(console.error);
    fetchRevenue().then(setRevenue).catch(console.error);
    fetchAttendanceReport().then(setAttendance).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Reports</h1></div>
        <div className="stats-grid">
          <StatsCard title="Active Players" value={dashboard?.activePlayers ?? '...'} description="Players currently active." />
          <StatsCard title="Total Paid" value={revenue?.totalPaid ?? '...'} description="Revenue collected so far." />
          <StatsCard title="Monthly Paid" value={revenue?.monthlyPaid ?? '...'} description="Revenue this month." />
          <StatsCard title="Total Remaining" value={revenue?.totalRemaining ?? '...'} description="Pending payment balance." />
        </div>
        <div className="table-card">
          <h2>Attendance Summary</h2>
          <table className="data-table">
            <thead><tr><th>Status</th><th>Count</th></tr></thead>
            <tbody>
              {attendance.length ? attendance.map((item) => (
                <tr key={item._id}><td>{item._id}</td><td>{item.count}</td></tr>
              )) : <tr><td colSpan="2">No attendance data.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ReportsPage;
