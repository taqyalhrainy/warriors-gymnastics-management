import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { markPresent, markAbsent, fetchAttendanceByPlayer } from '../services/attendance.js';
import { fetchGroups, fetchGroupPlayers } from '../services/groups.js';

const AttendancePage = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [players, setPlayers] = useState([]);
  const [attendanceHistory, setAttendanceHistory] = useState([]);
  const [historyPlayer, setHistoryPlayer] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchGroups().then(setGroups).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedGroup) {
      setPlayers([]);
      setAttendanceHistory([]);
      setHistoryPlayer(null);
      return;
    }
    fetchGroupPlayers(selectedGroup).then(setPlayers).catch(console.error);
  }, [selectedGroup]);

  const handleAction = async (playerId, status) => {
    try {
      setMessage('');
      await (status === 'present' ? markPresent({ playerId, groupId: selectedGroup }) : markAbsent({ playerId, groupId: selectedGroup }));
      setMessage('Attendance recorded');
      const updatedPlayers = await fetchGroupPlayers(selectedGroup);
      setPlayers(updatedPlayers);
      if (historyPlayer?._id === playerId) {
        const history = await fetchAttendanceByPlayer(playerId);
        setAttendanceHistory(history);
      }
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to record attendance');
    }
  };

  const handleViewHistory = async (player) => {
    try {
      setMessage('');
      const history = await fetchAttendanceByPlayer(player._id);
      setAttendanceHistory(history);
      setHistoryPlayer(player);
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to load attendance history');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Attendance</h1></div>
        <div className="form-card">
          <h2>Group Attendance</h2>
          {message && <p className="alert-info">{message}</p>}
          <label>Group</label>
          <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
            <option value="">Select Group</option>
            {groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}
          </select>
        </div>
        {selectedGroup && (
          <div className="table-card">
            <h2>Players in Selected Group</h2>
            <table className="data-table">
              <thead><tr><th>Player</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {players.length ? players.map((player) => (
                  <tr key={player._id}>
                    <td>{player.fullName}</td>
                    <td>{player.status}</td>
                    <td>
                      <button type="button" onClick={() => handleAction(player._id, 'present')}>Present</button>
                      <button type="button" onClick={() => handleAction(player._id, 'absent')}>Absent</button>
                      <button type="button" onClick={() => handleViewHistory(player)}>History</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="3">No players found for this group.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {historyPlayer && (
          <div className="table-card">
            <h2>Attendance History for {historyPlayer.fullName}</h2>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Status</th><th>Checked At</th></tr></thead>
              <tbody>
                {attendanceHistory.length ? attendanceHistory.map((record) => (
                  <tr key={record._id}>
                    <td>{new Date(record.date).toLocaleDateString()}</td>
                    <td>{record.status}</td>
                    <td>{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '—'}</td>
                  </tr>
                )) : <tr><td colSpan="3">No attendance history found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
};

export default AttendancePage;
