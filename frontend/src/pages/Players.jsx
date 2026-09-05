import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPlayers, deletePlayer, createPlayer } from '../services/players.js';
import { fetchGroups } from '../services/groups.js';
import { createParent, fetchParents } from '../services/parents.js';
import { fetchPackageOptions } from '../services/packageOptions.js';
import { createWaitingListEntry, deleteWaitingListEntry, fetchWaitingList, updateWaitingListEntry } from '../services/waitingList.js';
import { confirmAction } from '../utils/confirmAction.js';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const initialWaitingForm = {
  playerName: '',
  playerAge: '',
  parentPhone: '',
  desiredGroupIds: [],
  listType: 'waiting',
  notes: ''
};

const initialMovePlayerForm = {
  fullName: '',
  dateOfBirth: '',
  profileImage: '',
  parentName: '',
  parentPhone: '',
  groupIds: [],
  startDate: '',
  endDate: '',
  packageName: '',
  packageClasses: '',
  packageHours: '',
  payment: '',
  attendanceDueAmount: '',
  subscriptionNeedsAttention: false,
  status: 'active',
  note: '',
  parentId: '',
  parentMode: 'existing',
  parentSearch: ''
};

const PlayersPage = () => {
  const [players, setPlayers] = useState([]);
  const [parents, setParents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [packageOptions, setPackageOptions] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [waitingForm, setWaitingForm] = useState(initialWaitingForm);
  const [movePlayerForm, setMovePlayerForm] = useState(initialMovePlayerForm);
  const [movingWaitingEntry, setMovingWaitingEntry] = useState(null);
  const [editingWaitingEntryId, setEditingWaitingEntryId] = useState('');
  const [isWaitingFormOpen, setIsWaitingFormOpen] = useState(false);
  const [isWaitingExpanded, setIsWaitingExpanded] = useState(false);
  const [isWaitingGroupPickerOpen, setIsWaitingGroupPickerOpen] = useState(false);
  const [isMoveGroupPickerOpen, setIsMoveGroupPickerOpen] = useState(false);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [movePlayerMessage, setMovePlayerMessage] = useState('');
  const [isMovingToPlayers, setIsMovingToPlayers] = useState(false);
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
      fetchGroups(),
      fetchParents(),
      fetchPackageOptions()
    ])
      .then(([playersData, groupsData, parentData, packageData]) => {
        setPlayers(playersData);
        setGroups(groupsData);
        setParents(parentData);
        setPackageOptions(packageData);
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

  const normalizePhoneForMatch = (value) => normalizeDigits(value).replace(/\D/g, '');
  const searchText = search.trim().toLowerCase();
  const searchPhone = normalizePhoneForMatch(search);

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
      player.parentId?.name,
      player.parentPhone,
      player.parentId?.phone
    ].join(' ').toLowerCase().includes(searchText)
      || (searchPhone && normalizePhoneForMatch(`${player.parentPhone || ''} ${player.parentId?.phone || ''}`).includes(searchPhone)));

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

  const handleMoveGroupToggle = (groupId) => {
    setMovePlayerForm((current) => {
      const groupIds = current.groupIds.includes(groupId)
        ? current.groupIds.filter((id) => id !== groupId)
        : [...current.groupIds, groupId];
      return { ...current, groupIds };
    });
  };

  const handleMovePlayerFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (type === 'checkbox') {
      setMovePlayerForm((current) => ({ ...current, [name]: checked }));
      return;
    }
    if (name === 'payment' || name === 'packageClasses' || name === 'packageHours' || name === 'attendanceDueAmount') {
      setMovePlayerForm((current) => ({ ...current, [name]: normalizeDigits(value) }));
      return;
    }
    if (name === 'packageName') {
      const selectedPackage = packageOptions.find((option) => option.label === value);
      setMovePlayerForm((current) => ({
        ...current,
        packageName: value,
        packageClasses: selectedPackage ? selectedPackage.classes : current.packageClasses,
        packageHours: selectedPackage ? selectedPackage.hours : current.packageHours
      }));
      return;
    }
    setMovePlayerForm((current) => ({ ...current, [name]: value }));
  };

  const handleMovePlayerProfileImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setMovePlayerForm((current) => ({ ...current, profileImage: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const handleMoveParentSelect = (event) => {
    const parentId = event.target.value;
    const parent = parents.find((item) => item._id === parentId);
    setMovePlayerForm((current) => ({
      ...current,
      parentId,
      parentName: parent?.name || '',
      parentPhone: parent?.phone || current.parentPhone
    }));
  };

  const setMoveParentMode = (parentMode) => {
    setMovePlayerForm((current) => ({
      ...current,
      parentMode,
      parentId: parentMode === 'new' ? '' : current.parentId
    }));
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
    } catch (error) {
      setWaitingMessage(error.response?.data?.message || 'Unable to save waiting list entry.');
    }
  };

  const handleWaitingEdit = (entry) => {
    setWaitingForm({
      playerName: entry.playerName || '',
      playerAge: entry.playerAge ?? '',
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

  const handleMoveWaitingEntry = async (listType) => {
    if (!editingWaitingEntryId) return;
    setWaitingMessage('');
    try {
      const entry = await updateWaitingListEntry(editingWaitingEntryId, { ...waitingForm, listType });
      setWaitingList((current) => current.map((item) => (item._id === entry._id ? entry : item)));
      setWaitingForm(initialWaitingForm);
      setEditingWaitingEntryId('');
      setWaitingMessage(listType === 'data' ? 'Moved to Data list.' : 'Moved to Waiting list.');
    } catch (error) {
      setWaitingMessage(error.response?.data?.message || 'Unable to move entry.');
    }
  };

  const openMoveToPlayers = (entry) => {
    const groupIds = (entry.desiredGroupIds?.length ? entry.desiredGroupIds : [entry.desiredGroupId].filter(Boolean))
      .map((group) => group?._id || group)
      .filter(Boolean);
    setMovingWaitingEntry(entry);
    setMovePlayerForm({
      ...initialMovePlayerForm,
      fullName: entry.playerName || '',
      parentPhone: entry.parentPhone || '',
      groupIds,
      note: entry.notes || ''
    });
    setMovePlayerMessage('');
    setIsMoveGroupPickerOpen(false);
  };

  const closeMoveToPlayers = (force = false) => {
    if (isMovingToPlayers && !force) return;
    setMovingWaitingEntry(null);
    setMovePlayerForm(initialMovePlayerForm);
    setMovePlayerMessage('');
    setIsMoveGroupPickerOpen(false);
  };

  const findParentByPhone = (phone) => {
    const normalizedPhone = normalizePhoneForMatch(phone);
    if (!normalizedPhone) return null;
    return parents.find((parent) => normalizePhoneForMatch(parent.phone) === normalizedPhone) || null;
  };

  const handleMoveToPlayersSubmit = async (event) => {
    event.preventDefault();
    if (!movingWaitingEntry || isMovingToPlayers) return;
    setMovePlayerMessage('');

    if (!movePlayerForm.fullName.trim()) {
      setMovePlayerMessage('Player name is required.');
      return;
    }
    if (!movePlayerForm.parentPhone.trim()) {
      setMovePlayerMessage('Parent phone is required.');
      return;
    }
    if (!movePlayerForm.groupIds.length) {
      setMovePlayerMessage('Choose at least one group.');
      return;
    }

    setIsMovingToPlayers(true);
    try {
      let parent = movePlayerForm.parentId
        ? parents.find((item) => item._id === movePlayerForm.parentId)
        : findParentByPhone(movePlayerForm.parentPhone);
      if (!parent && movePlayerForm.parentMode !== 'new') {
        parent = findParentByPhone(movePlayerForm.parentPhone);
      }
      if (!parent) {
        if (!movePlayerForm.parentName.trim()) {
          setMovePlayerMessage('Parent name is required when this phone is not already saved.');
          setIsMovingToPlayers(false);
          return;
        }
        parent = await createParent({
          name: movePlayerForm.parentName.trim(),
          phone: movePlayerForm.parentPhone.trim(),
          password: `wg-${Date.now()}`
        });
        setParents((current) => [parent, ...current]);
      }

      const playerPayload = {
        fullName: movePlayerForm.fullName.trim(),
        dateOfBirth: movePlayerForm.dateOfBirth || '',
        profileImage: movePlayerForm.profileImage || '',
        parentId: parent._id,
        parentPhone: movePlayerForm.parentPhone.trim(),
        groupId: movePlayerForm.groupIds[0] || '',
        groupIds: movePlayerForm.groupIds,
        startDate: movePlayerForm.startDate,
        endDate: movePlayerForm.endDate,
        packageName: movePlayerForm.packageName,
        packageClasses: parseLocalizedNumber(movePlayerForm.packageClasses),
        packageHours: parseLocalizedNumber(movePlayerForm.packageHours),
        payment: parseLocalizedNumber(movePlayerForm.payment),
        subscriptionNeedsAttention: movePlayerForm.subscriptionNeedsAttention,
        status: movePlayerForm.status,
        note: movePlayerForm.note
      };

      if (movePlayerForm.attendanceDueAmount !== '') {
        playerPayload.previousDueBalance = parseLocalizedNumber(movePlayerForm.attendanceDueAmount);
        playerPayload.dueAdjustment = 0;
        playerPayload.attendanceDueManual = true;
      }

      const player = await createPlayer(playerPayload);

      await deleteWaitingListEntry(movingWaitingEntry._id);
      setPlayers((current) => [player, ...current.filter((item) => item._id !== player._id)]);
      setWaitingList((current) => current.filter((entry) => entry._id !== movingWaitingEntry._id));
      setWaitingMessage('Moved to Players.');
      closeMoveToPlayers(true);
    } catch (error) {
      setMovePlayerMessage(error.response?.data?.message || 'Unable to move this entry to Players.');
    } finally {
      setIsMovingToPlayers(false);
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

  const selectedMoveGroupNames = groups
    .filter((group) => movePlayerForm.groupIds.includes(group._id))
    .map((group) => group.name);

  const filteredMoveParents = parents
    .filter((parent) => [
      parent.name,
      parent.phone,
      parent.email
    ].join(' ').toLowerCase().includes(movePlayerForm.parentSearch.trim().toLowerCase()))
    .slice(0, 80);

  const getWaitingEntryDays = (entry) => new Set(getWaitingEntryGroups(entry)
    .flatMap((group) => group?.days || [])
    .filter(Boolean));

  const waitingDayOptions = [...new Set(groups.flatMap((group) => group.days || []))];
  const waitingViewEntries = waitingList.filter((entry) => (entry.listType || 'waiting') === waitingView);
  const filteredWaitingList = waitingList
    .filter((entry) => (entry.listType || 'waiting') === waitingView)
    .filter((entry) => waitingDayFilter === 'all' || getWaitingEntryDays(entry).has(waitingDayFilter))
    .filter((entry) => !waitingAgeFilter || String(entry.playerAge ?? '').trim() === waitingAgeFilter.trim());

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
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search players or parent phone..." />
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
                  <input name="playerAge" inputMode="decimal" value={waitingForm.playerAge} onChange={handleWaitingFormChange} />
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
                  <button className="btn-secondary" type="button" onClick={() => handleMoveWaitingEntry('data')}>Move to Data list</button>
                )}
                {editingWaitingEntryId && waitingForm.listType === 'data' && (
                  <button className="btn-secondary" type="button" onClick={() => handleMoveWaitingEntry('waiting')}>Move to Waiting list</button>
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
                  <input inputMode="decimal" value={waitingAgeFilter} onChange={(event) => setWaitingAgeFilter(event.target.value)} placeholder="All ages" />
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
                            <button className="btn-secondary" type="button" onClick={() => openMoveToPlayers(entry)}>Move to Players</button>
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
        {movingWaitingEntry && (
          <div className="student-modal-backdrop" role="presentation" onClick={closeMoveToPlayers}>
            <section className="student-modal waiting-list-modal" role="dialog" aria-modal="true" aria-label="Move to Players" onClick={(event) => event.stopPropagation()}>
              <div className="student-modal-header">
                <div>
                  <h2>Move to Players</h2>
                  <p>Complete the required player details before adding this entry to attendance.</p>
                </div>
                <button type="button" className="waiting-icon-button is-close" onClick={closeMoveToPlayers}>{t('close')}</button>
              </div>

              {movePlayerMessage && <p className="alert-error">{movePlayerMessage}</p>}

              <form className="move-player-form" onSubmit={handleMoveToPlayersSubmit}>
                <div className="move-player-panel is-primary">
                  <div className="move-player-panel-title">
                    <span>01</span>
                    <div>
                      <h3>Player</h3>
                      <p>Basic profile details.</p>
                    </div>
                  </div>
                  <div className="move-player-grid">
                    <label>
                      <span>Player name</span>
                      <input name="fullName" value={movePlayerForm.fullName} onChange={handleMovePlayerFormChange} required />
                    </label>
                    <label>
                      <span>{t('dateOfBirth')}</span>
                      <input name="dateOfBirth" type="date" value={movePlayerForm.dateOfBirth} onChange={handleMovePlayerFormChange} />
                    </label>
                    <div className="player-form-photo-row">
                      <div className="player-avatar">
                        {movePlayerForm.profileImage ? <img src={movePlayerForm.profileImage} alt="" /> : <span>{movePlayerForm.fullName?.charAt(0) || '?'}</span>}
                      </div>
                      <label>
                        <span>Profile picture</span>
                        <input type="file" accept="image/*" onChange={handleMovePlayerProfileImageChange} />
                      </label>
                      {movePlayerForm.profileImage && (
                        <button type="button" className="btn-secondary" onClick={() => setMovePlayerForm((current) => ({ ...current, profileImage: '' }))}>
                          Remove
                        </button>
                      )}
                    </div>
                    <label>
                      <span>Status</span>
                      <select name="status" value={movePlayerForm.status} onChange={handleMovePlayerFormChange}>
                        <option value="active">Active</option>
                        <option value="tryout">Tryout</option>
                        <option value="frozen">Frozen</option>
                        <option value="left">Left</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="move-player-panel">
                  <div className="move-player-panel-title">
                    <span>02</span>
                    <div>
                      <h3>Parent</h3>
                      <p>Select an existing parent or create a new one.</p>
                    </div>
                  </div>
                  <div className="move-parent-mode" role="tablist" aria-label="Parent mode">
                    <button type="button" className={movePlayerForm.parentMode === 'existing' ? 'is-active' : ''} onClick={() => setMoveParentMode('existing')}>
                      Existing parent
                    </button>
                    <button type="button" className={movePlayerForm.parentMode === 'new' ? 'is-active' : ''} onClick={() => setMoveParentMode('new')}>
                      New parent
                    </button>
                  </div>
                  {movePlayerForm.parentMode === 'existing' && (
                    <div className="move-player-grid">
                      <label className="move-player-wide">
                        <span>Search parent</span>
                        <input name="parentSearch" type="search" value={movePlayerForm.parentSearch} onChange={handleMovePlayerFormChange} placeholder="Name or phone..." />
                      </label>
                      <label className="move-player-wide">
                        <span>Choose parent</span>
                        <select value={movePlayerForm.parentId} onChange={handleMoveParentSelect}>
                          <option value="">Auto match by phone or choose parent</option>
                          {filteredMoveParents.map((parent) => (
                            <option key={parent._id} value={parent._id}>
                              {parent.phone ? `${parent.name} (${parent.phone})` : parent.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="move-player-grid">
                    <label>
                      <span>Parent name</span>
                      <input name="parentName" value={movePlayerForm.parentName} onChange={handleMovePlayerFormChange} placeholder={movePlayerForm.parentMode === 'new' ? 'Required for new parent' : 'Filled when selected'} />
                    </label>
                    <label>
                      <span>Parent phone</span>
                      <input name="parentPhone" value={movePlayerForm.parentPhone} onChange={handleMovePlayerFormChange} required />
                    </label>
                  </div>
                </div>

                <div className="move-player-panel">
                  <div className="move-player-panel-title">
                    <span>03</span>
                    <div>
                      <h3>Schedule</h3>
                      <p>Groups and subscription dates.</p>
                    </div>
                  </div>
                <div className="waiting-list-group-picker">
                  <span>Groups</span>
                  <button
                    type="button"
                    className="waiting-picker-trigger"
                    onClick={() => setIsMoveGroupPickerOpen((current) => !current)}
                  >
                    <b>{selectedMoveGroupNames.length ? `${selectedMoveGroupNames.length} selected` : 'Choose groups'}</b>
                    <small>{selectedMoveGroupNames.slice(0, 2).join(', ') || 'Tap to show options'}</small>
                  </button>
                  {isMoveGroupPickerOpen && (
                    <div className="waiting-picker-menu">
                      {groups.map((group) => (
                        <label key={group._id}>
                          <input
                            type="checkbox"
                            checked={movePlayerForm.groupIds.includes(group._id)}
                            onChange={() => handleMoveGroupToggle(group._id)}
                          />
                          <b>{group.name}</b>
                          <small>{group.days?.join(', ')} {group.startTime} - {group.endTime}</small>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                  <div className="move-player-grid">
                    <label>
                      <span>Start Date</span>
                      <input name="startDate" type="date" value={movePlayerForm.startDate} onChange={handleMovePlayerFormChange} />
                    </label>
                    <label>
                      <span>End Date</span>
                      <input name="endDate" type="date" value={movePlayerForm.endDate} onChange={handleMovePlayerFormChange} />
                    </label>
                  </div>
                </div>

                <div className="move-player-panel">
                  <div className="move-player-panel-title">
                    <span>04</span>
                    <div>
                      <h3>Subscription</h3>
                      <p>Package, payment, and notes.</p>
                    </div>
                  </div>
                  <div className="move-player-grid">
                    <label>
                      <span>Package</span>
                      <select name="packageName" value={movePlayerForm.packageName} onChange={handleMovePlayerFormChange}>
                        <option value="">Select Package</option>
                        {packageOptions.map((option) => (
                          <option key={option.label} value={option.label}>{option.label}</option>
                        ))}
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                    <label>
                      <span>Payment</span>
                      <input name="payment" type="text" inputMode="decimal" value={movePlayerForm.payment} onChange={handleMovePlayerFormChange} />
                    </label>
                    <label>
                      <span>Attendance due</span>
                      <input
                        name="attendanceDueAmount"
                        type="text"
                        inputMode="decimal"
                        value={movePlayerForm.attendanceDueAmount}
                        onChange={handleMovePlayerFormChange}
                        placeholder="100 due / -100 credit"
                      />
                    </label>
                    <label>
                      <span>Classes</span>
                      <input name="packageClasses" type="text" inputMode="decimal" value={movePlayerForm.packageClasses} onChange={handleMovePlayerFormChange} />
                    </label>
                    <label>
                      <span>Hours</span>
                      <input name="packageHours" type="text" inputMode="decimal" value={movePlayerForm.packageHours} onChange={handleMovePlayerFormChange} />
                    </label>
                    <label className="move-player-wide">
                      <span>Note</span>
                      <input name="note" value={movePlayerForm.note} onChange={handleMovePlayerFormChange} />
                    </label>
                    <label className="move-player-wide move-player-toggle">
                      <input
                        name="subscriptionNeedsAttention"
                        type="checkbox"
                        checked={movePlayerForm.subscriptionNeedsAttention}
                        onChange={handleMovePlayerFormChange}
                      />
                      <span>
                        <b>Enable highlight</b>
                        <small>Show this player in red for admin review.</small>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="move-player-actions">
                  <button className="btn-primary" type="submit" disabled={isMovingToPlayers}>
                    {isMovingToPlayers ? 'Moving...' : 'Add to Players'}
                  </button>
                  <button className="btn-secondary" type="button" onClick={closeMoveToPlayers} disabled={isMovingToPlayers}>Cancel</button>
                </div>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default PlayersPage;
