import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPlayers, deletePlayer } from '../services/players.js';
import { fetchGroups } from '../services/groups.js';
import { createWaitingListEntry, deleteWaitingListEntry, fetchWaitingList, updateWaitingListEntry } from '../services/waitingList.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const initialWaitingForm = {
  playerName: '',
  playerAge: '',
  parentPhone: '',
  desiredGroupIds: [],
  listType: 'waiting',
  notes: ''
};

const PlayersPage = () => {
  const [players, setPlayers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [waitingForm, setWaitingForm] = useState(initialWaitingForm);
  const [editingWaitingEntryId, setEditingWaitingEntryId] = useState('');
  const [isWaitingFormOpen, setIsWaitingFormOpen] = useState(false);
  const [isWaitingExpanded, setIsWaitingExpanded] = useState(false);
  const [isWaitingGroupPickerOpen, setIsWaitingGroupPickerOpen] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [waitingView, setWaitingView] = useState('waiting');
  const [waitingDayFilter, setWaitingDayFilter] = useState('all');
  const [waitingAgeFilter, setWaitingAgeFilter] = useState('');
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
    fetchWaitingList().then(setWaitingList).catch(console.error);
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

  const handleWaitingFormChange = (event) => {
    const { name, value } = event.target;
    setWaitingForm((current) => ({ ...current, [name]: value }));
  };

  const handleWaitingGroupToggle = (groupId) => {
    setWaitingForm((current) => {
      const groupIds = current.desiredGroupIds.includes(groupId)
        ? current.desiredGroupIds.filter((id) => id !== groupId)
        : [...current.desiredGroupIds, groupId];
      return { ...current, desiredGroupIds: groupIds };
    });
  };

  const handleWaitingSubmit = async (event) => {
    event.preventDefault();
    setWaitingMessage('');
    try {
      if (editingWaitingEntryId) {
        const entry = await updateWaitingListEntry(editingWaitingEntryId, waitingForm);
        setWaitingList((current) => current.map((item) => (item._id === entry._id ? entry : item)));
        setWaitingMessage('Waiting list entry updated.');
      } else {
        const entry = await createWaitingListEntry({ ...waitingForm, listType: 'waiting' });
        setWaitingList((current) => [...current, entry]);
        setWaitingMessage('Player added to the waiting list.');
      }
      setWaitingForm(initialWaitingForm);
      setEditingWaitingEntryId('');
      if (!editingWaitingEntryId) setIsWaitingFormOpen(false);
    } catch (error) {
      setWaitingMessage(error.response?.data?.message || 'Unable to save waiting list entry.');
    }
  };

  const handleWaitingEdit = (entry) => {
    setWaitingForm({
      playerName: entry.playerName || '',
      playerAge: typeof entry.playerAge === 'number' ? String(entry.playerAge) : '',
      parentPhone: entry.parentPhone || '',
      desiredGroupIds: (entry.desiredGroupIds?.length ? entry.desiredGroupIds : [entry.desiredGroupId].filter(Boolean))
        .map((group) => group?._id || group)
        .filter(Boolean),
      listType: entry.listType || 'waiting',
      notes: entry.notes || ''
    });
    setEditingWaitingEntryId(entry._id);
    setWaitingMessage('');
  };

  const handleWaitingCancelEdit = () => {
    setWaitingForm(initialWaitingForm);
    setEditingWaitingEntryId('');
    setWaitingMessage('');
  };

  const handleMoveWaitingToData = async () => {
    if (!editingWaitingEntryId) return;
    setWaitingMessage('');
    try {
      const entry = await updateWaitingListEntry(editingWaitingEntryId, { ...waitingForm, listType: 'data' });
      setWaitingList((current) => current.map((item) => (item._id === entry._id ? entry : item)));
      setWaitingForm(initialWaitingForm);
      setEditingWaitingEntryId('');
      setWaitingView('data');
      setWaitingMessage('Moved to Data list.');
    } catch (error) {
      setWaitingMessage(error.response?.data?.message || 'Unable to move entry to Data list.');
    }
  };

  const closeWaitingListModal = () => {
    setIsWaitingFormOpen(false);
    setIsWaitingExpanded(false);
    setIsWaitingGroupPickerOpen(false);
    handleWaitingCancelEdit();
  };

  const handleWaitingDelete = async (id) => {
    try {
      await deleteWaitingListEntry(id);
      setWaitingList((current) => current.filter((entry) => entry._id !== id));
      setWaitingMessage('Waiting list entry deleted.');
    } catch (error) {
      setWaitingMessage(error.response?.data?.message || 'Unable to delete waiting list entry.');
    }
  };

  const getWaitingEntryGroups = (entry) => (
    entry.desiredGroupIds?.length ? entry.desiredGroupIds : [entry.desiredGroupId].filter(Boolean)
  );

  const getWaitingEntryGroupText = (entry) => getWaitingEntryGroups(entry)
    .map((group) => group?.name)
    .filter(Boolean)
    .join(', ') || t('notSet');

  const selectedWaitingGroupNames = groups
    .filter((group) => waitingForm.desiredGroupIds.includes(group._id))
    .map((group) => group.name);

  const getWaitingEntryDays = (entry) => new Set(getWaitingEntryGroups(entry)
    .flatMap((group) => group?.days || [])
    .filter(Boolean));

  const waitingDayOptions = [...new Set(groups.flatMap((group) => group.days || []))];
  const waitingViewEntries = waitingList.filter((entry) => (entry.listType || 'waiting') === waitingView);
  const filteredWaitingList = waitingList
    .filter((entry) => (entry.listType || 'waiting') === waitingView)
    .filter((entry) => waitingDayFilter === 'all' || getWaitingEntryDays(entry).has(waitingDayFilter))
    .filter((entry) => !waitingAgeFilter || Number(entry.playerAge) === Number(waitingAgeFilter));

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
            <button className="waiting-list-button" type="button" onClick={() => setIsWaitingFormOpen(true)}>
              <span>Waiting List</span>
            </button>
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
        {isWaitingFormOpen && (
          <div className="student-modal-backdrop" role="presentation" onClick={closeWaitingListModal}>
            <section className={`student-modal waiting-list-modal${isWaitingExpanded ? ' is-expanded' : ''}`} role="dialog" aria-modal="true" aria-label="Waiting List" onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div className="waiting-list-heading">
                  <div>
                    <h2>Waiting List</h2>
                    <p>Interested players without adding them to Players yet.</p>
                  </div>
                  <strong>{waitingViewEntries.length}</strong>
                </div>
                <div className="waiting-modal-actions">
                  <button type="button" className="waiting-icon-button" onClick={() => setIsWaitingExpanded((current) => !current)}>
                    {isWaitingExpanded ? 'Exit full screen' : 'Full screen'}
                  </button>
                  <button type="button" className="waiting-icon-button is-close" onClick={closeWaitingListModal}>{t('close')}</button>
                </div>
              </div>

              {waitingMessage && <p className="alert-info">{waitingMessage}</p>}

              <div className="waiting-list-tabs" role="tablist" aria-label="Waiting list views">
                <button
                  type="button"
                  className={waitingView === 'waiting' ? 'is-active' : ''}
                  onClick={() => setWaitingView('waiting')}
                >
                  Waiting
                </button>
                <button
                  type="button"
                  className={waitingView === 'data' ? 'is-active' : ''}
                  onClick={() => setWaitingView('data')}
                >
                  Data
                </button>
              </div>

              <form className="waiting-list-form" onSubmit={handleWaitingSubmit}>
                <label>
                  <span>Player name</span>
                  <input name="playerName" value={waitingForm.playerName} onChange={handleWaitingFormChange} />
                </label>
                <label>
                  <span>Age</span>
                  <input name="playerAge" type="number" min="0" max="120" step="0.1" value={waitingForm.playerAge} onChange={handleWaitingFormChange} />
                </label>
                <label>
                  <span>Parent phone</span>
                  <input name="parentPhone" value={waitingForm.parentPhone} onChange={handleWaitingFormChange} />
                </label>
                <div className="waiting-list-group-picker">
                  <span>Desired times</span>
                  <button
                    type="button"
                    className="waiting-picker-trigger"
                    onClick={() => setIsWaitingGroupPickerOpen((current) => !current)}
                  >
                    <b>{selectedWaitingGroupNames.length ? `${selectedWaitingGroupNames.length} selected` : 'Choose desired times'}</b>
                    <small>{selectedWaitingGroupNames.slice(0, 2).join(', ') || 'Tap to show options'}</small>
                  </button>
                  {isWaitingGroupPickerOpen && (
                    <div className="waiting-picker-menu">
                      {groups.map((group) => (
                        <label key={group._id}>
                          <input
                            type="checkbox"
                            checked={waitingForm.desiredGroupIds.includes(group._id)}
                            onChange={() => handleWaitingGroupToggle(group._id)}
                          />
                          <b>{group.name}</b>
                          <small>{group.days?.join(', ')} {group.startTime} - {group.endTime}</small>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <label className="waiting-list-form-note">
                  <span>Note</span>
                  <input name="notes" value={waitingForm.notes} onChange={handleWaitingFormChange} />
                </label>
                <button className="btn-primary" type="submit">{editingWaitingEntryId ? 'Save changes' : 'Save to waiting list'}</button>
                {editingWaitingEntryId && waitingForm.listType !== 'data' && (
                  <button className="btn-secondary" type="button" onClick={handleMoveWaitingToData}>Move to Data list</button>
                )}
                {editingWaitingEntryId && (
                  <button className="btn-secondary" type="button" onClick={handleWaitingCancelEdit}>Cancel edit</button>
                )}
              </form>

              <div className="waiting-list-filters">
                <label>
                  <span>Day</span>
                  <select value={waitingDayFilter} onChange={(event) => setWaitingDayFilter(event.target.value)}>
                    <option value="all">All days</option>
                    {waitingDayOptions.map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </label>
                <label>
                  <span>Age</span>
                  <input type="number" min="0" max="120" step="0.1" value={waitingAgeFilter} onChange={(event) => setWaitingAgeFilter(event.target.value)} placeholder="All ages" />
                </label>
              </div>

              <div className="waiting-list-table-wrap">
                <table className="data-table waiting-list-table">
                  <thead>
                    <tr>
                      <th>Player name</th>
                      <th>Age</th>
                      <th>Parent phone</th>
                      <th>Desired times</th>
                      <th>Note</th>
                      <th>Added at</th>
                      <th>{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWaitingList.length ? filteredWaitingList.map((entry) => (
                      <tr key={entry._id}>
                        <td>{entry.playerName || '-'}</td>
                        <td>{entry.playerAge ?? '-'}</td>
                        <td>{entry.parentPhone ? <a href={`tel:${entry.parentPhone}`} className="waiting-phone-link">{entry.parentPhone}</a> : '-'}</td>
                        <td>{getWaitingEntryGroupText(entry)}</td>
                        <td>{entry.notes || '-'}</td>
                        <td>{entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : '-'}</td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-secondary" type="button" onClick={() => handleWaitingEdit(entry)}>{t('edit')}</button>
                            <button className="btn-secondary" type="button" onClick={() => handleWaitingDelete(entry._id)}>{t('delete')}</button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan="7">No {waitingView === 'data' ? 'data' : 'waiting list'} entries yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default PlayersPage;
