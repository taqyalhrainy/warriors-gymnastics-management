import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { getPlayer } from '../services/players.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const PlayerProfilePage = () => {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const { t } = useLanguage();

  useEffect(() => {
    getPlayer(id).then(setPlayer).catch(console.error);
  }, [id]);

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
            <div><strong>{t('group')}:</strong> {player.groupId?.name || t('unassigned')}</div>
            <div><strong>{t('parent')}:</strong> {player.parentId?.name || t('unknown')}</div>
            <div><strong>{t('startDate')}:</strong> {player.startDate?.split('T')[0] || t('notSet')}</div>
            <div><strong>{t('endDate')}:</strong> {player.endDate?.split('T')[0] || t('notSet')}</div>
            <div><strong>{t('package')}:</strong> {player.packageName ? (player.packageName === 'custom' ? t('customPackage') : player.packageName) : t('notSet')}</div>
            <div><strong>{t('classes')}:</strong> {player.packageClasses || t('notSet')}</div>
            <div><strong>{t('hours')}:</strong> {player.packageHours || t('notSet')}</div>
            <div><strong>{t('payment')}:</strong> {formatCurrency(player.payment || 0)}</div>
            <div><strong>{t('note')}:</strong> {player.note || t('notSet')}</div>
          </div>
        ) : (
          <p>{t('loadingPlayer')}</p>
        )}
      </main>
    </div>
  );
};

export default PlayerProfilePage;
