import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { fetchDashboard } from '../services/reports.js';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchDashboard().then(setStats).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Admin Dashboard</h1></div>
        <div className="stats-grid">
          <StatsCard title="Active Players" value={stats?.activePlayers ?? '...'} description="Current active gymnastics players." />
          <StatsCard title="Expired Subscriptions" value={stats?.expiredSubscriptions ?? '...'} description="Subscriptions that need renewal." />
          <StatsCard title="Ending Soon" value={stats?.soonSubscriptions ?? '...'} description="Subscriptions close to expiry." />
          <StatsCard title="Monthly Revenue" value={stats?.monthlyRevenue ?? '...'} description="Payments received this month." />
          <StatsCard title="Pending Amounts" value={stats?.pendingAmounts ?? '...'} description="Remaining balances for active subscriptions." />
          <StatsCard title="Present Today" value={stats?.presentCount ?? '...'} description="Players present today." />
          <StatsCard title="Absent Today" value={stats?.absentCount ?? '...'} description="Players absent today." />
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
