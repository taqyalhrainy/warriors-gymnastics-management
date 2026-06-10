import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPlayers, deletePlayer } from '../services/players.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const PlayersPage = () => {
  const [players, setPlayers] = useState([]);
  const { t } = useLanguage();

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
          <h1>{t('players')}</h1>
          <Link className="btn-primary" to="/players/new">{t('addPlayer')}</Link>
        </div>
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('name')}</th>
                <th>{t('group')}</th>
                <th>{t('status')}</th>
                <th>{t('parent')}</th>
                <th>{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {players.length === 0 && <tr><td colSpan="5">{t('noPlayersYet')}</td></tr>}
              {players.map((player) => (
                <tr key={player._id}>
                  <td>{player.fullName}</td>
                  <td>{player.groupId?.name || t('unassigned')}</td>
                  <td>{player.status}</td>
                  <td>{player.parentId?.name || t('unknown')}</td>
                  <td className="table-actions">
                    <Link to={`/players/${player._id}`}>{t('view')}</Link>
                    <Link to={`/players/${player._id}/edit`}>{t('edit')}</Link>
                    <button type="button" onClick={() => handleDelete(player._id)}>{t('delete')}</button>
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
