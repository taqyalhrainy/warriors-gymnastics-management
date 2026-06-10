import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParentAttendance } from '../services/parents.js';

const ParentAttendancePage = () => {
  const [attendance, setAttendance] = useState([]);

  useEffect(() => {
    fetchParentAttendance().then(setAttendance).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Attendance History</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Child</th><th>Date</th><th>Status</th><th>Time</th></tr></thead>
            <tbody>
              {attendance.length ? attendance.map((item) => (
                <tr key={item._id}>
                  <td>{item.playerId?.fullName || 'Child'}</td>
                  <td>{new Date(item.date).toLocaleDateString()}</td>
                  <td>{item.status}</td>
                  <td>{item.checkInTime ? new Date(item.checkInTime).toLocaleTimeString() : '-'}</td>
                </tr>
              )) : <tr><td colSpan="4">No attendance records found.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ParentAttendancePage;
