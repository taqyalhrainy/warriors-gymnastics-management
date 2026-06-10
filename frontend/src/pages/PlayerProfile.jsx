import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { getPlayer } from '../services/players.js';
import { formatCurrency } from '../utils/format.js';

const PlayerProfilePage = () => {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    getPlayer(id).then(setPlayer).catch(console.error);
  }, [id]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>Player Profile</h1>
          <Link className="btn-secondary" to="/players">Back to list</Link>
        </div>
        {player ? (
          <div className="card details-card">
            <div><strong>Name:</strong> {player.fullName}</div>
            <div><strong>Date of Birth:</strong> {player.dateOfBirth?.split('T')[0]}</div>
            <div><strong>Status:</strong> {player.status}</div>
            <div><strong>Group:</strong> {player.groupId?.name || 'Unassigned'}</div>
            <div><strong>Program:</strong> {player.programId?.name || 'Unassigned'}</div>
            <div><strong>Parent:</strong> {player.parentId?.name || 'Unknown'}</div>
            {player.subscriptionId && (
              <>
                <div><strong>Subscription Type:</strong> {player.subscriptionId.type}</div>
                <div><strong>Price:</strong> {formatCurrency(player.subscriptionId.price)}</div>
                <div><strong>Status:</strong> {player.subscriptionId.status}</div>
                {player.subscriptionId.type === 'time' && (
                  <div><strong>Days Remaining:</strong> {player.subscriptionId.daysRemaining ?? 0} days</div>
                )}
              </>
            )}
          </div>
        ) : (
          <p>Loading player...</p>
        )}
      </main>
    </div>
  );
};

export default PlayerProfilePage;
