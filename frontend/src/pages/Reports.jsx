import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { useSectionLoader, canShowEmpty } from '../hooks/useSectionLoader.js';
import { fetchDashboard, fetchRevenue, fetchAttendanceReport } from '../services/reports.js';
import StatsCard from '../components/StatsCard.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const ReportsPage = () => {
  const { states: loadStates, load: loadSection } = useSectionLoader(["dashboard","revenue","attendance"]);
  const [dashboard, setDashboard] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [search, setSearch] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    loadSection('dashboard', fetchDashboard, setDashboard);
    loadSection('revenue', fetchRevenue, setRevenue);
    loadSection('attendance', fetchAttendanceReport, setAttendance);
  }, []);

  const filteredAttendance = attendance.filter((item) => [
    item._id,
    item.count
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('reports')}</h1></div>
        <DataStatus state={loadStates.dashboard} />
        <DataStatus state={loadStates.revenue} />
        <div className="stats-grid">
          <StatsCard title={t('activePlayers')} value={dashboard?.activePlayers ?? '...'} description={t('activePlayersDesc')} />
          <StatsCard title={t('totalPaidReport')} value={revenue?.totalPaid ?? '...'} description={t('totalPaidDesc')} />
          <StatsCard title={t('monthlyPaid')} value={revenue?.monthlyPaid ?? '...'} description={t('monthlyPaidDesc')} />
          <StatsCard title={t('totalRemaining')} value={revenue?.totalRemaining ?? '...'} description={t('totalRemainingDesc')} />
        </div>
        <div className="table-card">
          <div className="table-toolbar">
            <h2>{t('attendanceSummary')}</h2>
            <label className="table-search">
              <span>Search</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report..." />
            </label>
          </div>
          <table className="data-table">
            <thead><tr><th>{t('status')}</th><th>{t('count')}</th></tr></thead>
            <tbody>
              {loadStates.attendance?.loading || loadStates.attendance?.error ? <tr><td colSpan="2"><DataStatus state={loadStates.attendance} /></td></tr> : filteredAttendance.length ? filteredAttendance.map((item) => (
                <tr key={item._id}><td>{item._id}</td><td>{item.count}</td></tr>
              )) : <tr><td colSpan="2">{t('noAttendanceData')}</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ReportsPage;
