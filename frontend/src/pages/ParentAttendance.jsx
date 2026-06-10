import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentAttendance } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentAttendancePage = () => {
  const [attendance, setAttendance] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    fetchParentAttendance().then(setAttendance).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('attendanceHistory')}</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>{t('child')}</th><th>{t('date')}</th><th>{t('status')}</th><th>{t('time')}</th></tr></thead>
            <tbody>
              {attendance.length ? attendance.map((item) => (
                <tr key={item._id}>
                  <td>{item.playerId?.fullName || t('child')}</td>
                  <td>{new Date(item.date).toLocaleDateString()}</td>
                  <td>{item.status}</td>
                  <td>{item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString() : '-'}</td>
                </tr>
              )) : <tr><td colSpan="4">{t('noAttendanceRecords')}</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ParentAttendancePage;
