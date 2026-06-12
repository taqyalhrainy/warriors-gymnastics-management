import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import StatsCard from '../components/StatsCard.jsx';
import { fetchDashboard } from '../services/reports.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const { t } = useLanguage();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    setError('');
    setStats(null);

    fetchDashboard()
      .then((data) => {
        if (isMounted) setStats(data);
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setError(err.response?.data?.message || 'Unable to load dashboard data. Please refresh or try again.');
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('adminDashboard')}</h1></div>
        {error && <p className="alert-error">{error}</p>}
        <div className="stats-grid">
          <StatsCard title={t('activePlayers')} value={stats?.activePlayers ?? '...'} description={t('activePlayersDesc')} />
          <StatsCard title={t('expiredSubscriptions')} value={stats?.expiredSubscriptions ?? '...'} description={t('expiredSubscriptionsDesc')} />
          <StatsCard title={t('endingSoon')} value={stats?.soonSubscriptions ?? '...'} description={t('endingSoonDesc')} />
          <StatsCard title={t('monthlyRevenue')} value={stats?.monthlyRevenue ?? '...'} description={t('monthlyRevenueDesc')} />
          <StatsCard title={t('pendingAmounts')} value={stats?.pendingAmounts ?? '...'} description={t('pendingAmountsDesc')} />
          <StatsCard title={t('presentToday')} value={stats?.presentCount ?? '...'} description={t('presentTodayDesc')} />
          <StatsCard title={t('absentToday')} value={stats?.absentCount ?? '...'} description={t('absentTodayDesc')} />
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
