import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPlayers, deletePlayer } from '../services/players.js';
import { fetchGroups } from '../services/groups.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const PlayersPage = () => {
  const [players, setPlayers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState('');
  const [statusView, setStatusView] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const { t } = useLanguage();

  useEffect(() => {
    Promise.all([
      fetchPlayers(),
      fetchGroups()
    ])
      .then(([playersData, groupsData]) => {
        setPlayers(playersData);
        setGroups(groupsData);
      })
      .catch(console.error);
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

  const getPlayerGroups = (player) => {
    const groups = player.groupIds?.length ? player.groupIds : [player.groupId].filter(Boolean);
    return groups.map((group) => group?.name).filter(Boolean).join(', ');
  };

  const getPlayerGroupIds = (player) => {
    const playerGroups = player.groupIds?.length ? player.groupIds : [player.groupId].filter(Boolean);
    return playerGroups.map((group) => group?._id || group).filter(Boolean).map(String);
  };

  const getPlayerSubscriptionName = (player) => (
    player.packageName
    || player.subscriptionId?.packageName
    || ''
  );

  const statusTabs = [
    { key: 'all', label: 'All Players' },
    { key: 'active', label: 'Active Players' },
    { key: 'left', label: 'Left Players' },
    { key: 'frozen', label: 'Frozen' },
    { key: 'tryout', label: 'Tryout' }
  ];

  const subscriptionOptions = [...new Set(players
    .map(getPlayerSubscriptionName)
    .filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));

  const filteredPlayers = players
    .filter((player) => statusView === 'all' || (player.status || 'active') === statusView)
    .filter((player) => groupFilter === 'all' || getPlayerGroupIds(player).includes(groupFilter))
    .filter((player) => (
      subscriptionFilter === 'all'
      || (subscriptionFilter === 'none' && !getPlayerSubscriptionName(player))
      || getPlayerSubscriptionName(player) === subscriptionFilter
    ))
    .filter((player) => [
      player.fullName,
      getPlayerGroups(player),
      getPlayerSubscriptionName(player),
      player.status,
      player.parentId?.name
    ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  const hasActiveFilters = groupFilter !== 'all' || subscriptionFilter !== 'all' || search.trim();

  const resetFilters = () => {
    setSearch('');
    setGroupFilter('all');
    setSubscriptionFilter('all');
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('players')}</h1>
          <div className="page-header-actions">
            <div className="status-tabs" role="tablist" aria-label="Player status">
              {statusTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={statusView === tab.key ? 'active' : ''}
                  onClick={() => setStatusView(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Link className="btn-primary" to="/players/new">{t('addPlayer')}</Link>
          </div>
        </div>
        <div className="table-card">
          <div className="table-toolbar">
            <div>
              <h2>{statusTabs.find((tab) => tab.key === statusView)?.label || t('players')}</h2>
              <p className="table-filter-count">{filteredPlayers.length} of {players.length}</p>
            </div>
            <div className="player-filter-bar">
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players..." />
              </label>
              <label className="table-filter-field">
                <span>Group</span>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="all">All groups</option>
                  {groups.map((group) => (
                    <option key={group._id} value={group._id}>{group.name}</option>
                  ))}
                </select>
              </label>
              <label className="table-filter-field">
                <span>Subscription</span>
                <select value={subscriptionFilter} onChange={(event) => setSubscriptionFilter(event.target.value)}>
                  <option value="all">All subscriptions</option>
                  {subscriptionOptions.map((subscriptionName) => (
                    <option key={subscriptionName} value={subscriptionName}>{subscriptionName}</option>
                  ))}
                  <option value="none">No subscription</option>
                </select>
              </label>
              {hasActiveFilters && (
                <button type="button" className="table-filter-reset" onClick={resetFilters}>Clear</button>
              )}
            </div>
          </div>
          <table className="data-table players-table">
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
              {filteredPlayers.length === 0 && <tr><td colSpan="5">{t('noPlayersYet')}</td></tr>}
              {filteredPlayers.map((player) => (
                <tr key={player._id}>
                  <td>{player.fullName}</td>
                  <td>{getPlayerGroups(player) || t('unassigned')}</td>
                  <td>{player.status}</td>
                  <td>{player.parentId?.name || t('unknown')}</td>
                  <td className="table-actions player-table-actions">
                    <Link className="table-action-button" to={`/players/${player._id}`}>{t('view')}</Link>
                    <Link className="table-action-button is-edit" to={`/players/${player._id}/edit`}>{t('edit')}</Link>
                    <button className="table-action-button is-danger" type="button" onClick={() => handleDelete(player._id)}>{t('delete')}</button>
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
