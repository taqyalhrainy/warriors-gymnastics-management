import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { getPlayer } from '../services/players.js';
import { fetchAttendanceByPlayer } from '../services/attendance.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const PlayerProfilePage = () => {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    Promise.all([getPlayer(id), fetchAttendanceByPlayer(id)])
      .then(([playerData, attendanceData]) => {
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        setPlayer(playerData);
        setAttendanceHistory(attendanceData.filter((record) => new Date(record.date) >= threeMonthsAgo));
      })
      .catch(console.error);
  }, [id]);

  const getPlayerGroups = (value) => {
    const groups = value?.groupIds?.length ? value.groupIds : [value?.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('playerProfile')}</h1>
          <Link className="btn-secondary" to="/players">{t('backToList')}</Link>
        </div>
        {player ? (
          <div className="card details-card">
            <div><strong>{t('name')}:</strong> {player.fullName}</div>
            <div><strong>{t('status')}:</strong> {player.status}</div>
            <div><strong>{t('group')}:</strong> {getPlayerGroups(player) || t('unassigned')}</div>
            <div><strong>{t('parent')}:</strong> {player.parentId?.name || t('unknown')}</div>
            <div><strong>{t('startDate')}:</strong> {player.startDate?.split('T')[0] || t('notSet')}</div>
            <div><strong>{t('endDate')}:</strong> {player.endDate?.split('T')[0] || t('notSet')}</div>
            <div><strong>{t('package')}:</strong> {player.packageName ? (player.packageName === 'custom' ? t('customPackage') : player.packageName) : t('notSet')}</div>
            <div><strong>{t('classes')}:</strong> {player.packageClasses || t('notSet')}</div>
            <div><strong>{t('hours')}:</strong> {player.packageHours || t('notSet')}</div>
            <div><strong>{t('payment')}:</strong> {formatCurrency(player.payment || 0)}</div>
            <div><strong>{t('note')}:</strong> {player.note || t('notSet')}</div>
            <div className="profile-attendance-history">
              <h2>Attendance History</h2>
              <div className="student-history-list">
                {attendanceHistory.length ? attendanceHistory.map((record) => (
                  <div className="student-history-row" key={record._id}>
                    <span>{new Date(record.date).toLocaleDateString()}</span>
                    <strong>{record.status}</strong>
                    <span>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</span>
                  </div>
                )) : <p className="empty-state">No attendance history found for the last 3 months.</p>}
              </div>
            </div>
          </div>
        ) : (
          <p>{t('loadingPlayer')}</p>
        )}
      </main>
    </div>
  );
};

export default PlayerProfilePage;
