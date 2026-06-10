import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPlayers, deletePlayer } from '../services/players.js';
import { confirmAction } from '../utils/confirmAction.js';

const PlayersPage = () => {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    fetchPlayers().then(setPlayers).catch(console.error);
  }, []);

  const handleDelete = async (id) => {
    const confirmed = confirmAction('حذف اللاعب');
    if (!confirmed) return;
    try {
      await deletePlayer(id);
      setPlayers(players.filter((player) => player._id !== id));
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.message || 'Unable to delete player.');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>Players</h1>
          <Link className="btn-primary" to="/players/new">Add Player</Link>
        </div>
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Group</th>
                <th>Status</th>
                <th>Parent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && <tr><td colSpan="5">No players yet.</td></tr>}
              {players.map((player) => (
                <tr key={player._id}>
                  <td>{player.fullName}</td>
                  <td>{player.groupId?.name || 'Unassigned'}</td>
                  <td>{player.status}</td>
                  <td>{player.parentId?.name || 'Unknown'}</td>
                  <td>
                    <Link to={`/players/${player._id}`}>View</Link>
                    <button type="button" onClick={() => handleDelete(player._id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default PlayersPage;
