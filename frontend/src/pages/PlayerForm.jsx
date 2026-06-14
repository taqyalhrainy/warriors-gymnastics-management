import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { createPlayer, updatePlayer, getPlayer } from '../services/players.js';
import { fetchGroups } from '../services/groups.js';
import { fetchParents } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';

const packageOptions = [
  { label: '8 classes (1 hour)', classes: 8, hours: 1 },
  { label: '8 classes (1.5 hours)', classes: 8, hours: 1.5 },
  { label: '8 classes (2 hours)', classes: 8, hours: 2 },
  { label: '12 classes (1.5 hours)', classes: 12, hours: 1.5 },
  { label: '12 classes (2 hours)', classes: 12, hours: 2 },
  { label: '16 classes (1.5 hours)', classes: 16, hours: 1.5 },
  { label: '16 classes (2 hours)', classes: 16, hours: 2 }
];

const PlayerFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState({
    fullName: '',
    parentId: '',
    parentPhone: '',
    groupId: '',
    groupIds: [],
    startDate: '',
    endDate: '',
    packageName: '',
    packageClasses: '',
    packageHours: '',
    payment: '',
    note: '',
    status: 'active'
  });
  const [parents, setParents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [message, setMessage] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    Promise.all([fetchParents(), fetchGroups()])
      .then(([parentData, groupData]) => {
        setParents(parentData);
        setGroups(groupData);
      })
      .catch(console.error);

    if (id) {
      getPlayer(id).then((data) => setPlayer({
        fullName: data.fullName,
        parentId: data.parentId?._id || '',
        parentPhone: data.parentPhone || '',
        groupId: data.groupId?._id || '',
        groupIds: data.groupIds?.length ? data.groupIds.map((group) => group._id || group) : (data.groupId?._id ? [data.groupId._id] : []),
        startDate: data.startDate?.split('T')[0] || '',
        endDate: data.endDate?.split('T')[0] || '',
        packageName: data.packageName || '',
        packageClasses: data.packageClasses || '',
        packageHours: data.packageHours || '',
        payment: data.payment ?? '',
        note: data.note || '',
        status: data.status || 'active'
      })).catch(console.error);
    }
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'parentId') {
      const selectedParent = parents.find((parent) => parent._id === value);
      setPlayer({ ...player, parentId: value, parentPhone: selectedParent?.phone || '' });
      return;
    }
    if (name === 'packageName') {
      const selectedPackage = packageOptions.find((option) => option.label === value);
      setPlayer({
        ...player,
        packageName: value,
        packageClasses: selectedPackage ? selectedPackage.classes : '',
        packageHours: selectedPackage ? selectedPackage.hours : ''
      });
      return;
    }
    if (name === 'payment') {
      setPlayer({ ...player, payment: normalizeDigits(value) });
      return;
    }
    setPlayer({ ...player, [name]: value });
  };

  const handleGroupToggle = (groupId) => {
    setPlayer((current) => {
      const nextGroupIds = current.groupIds.includes(groupId)
        ? current.groupIds.filter((id) => id !== groupId)
        : [...current.groupIds, groupId];
      return { ...current, groupIds: nextGroupIds, groupId: nextGroupIds[0] || '' };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (id) {
        await updatePlayer(id, { ...player, groupId: player.groupIds[0] || '', groupIds: player.groupIds, payment: parseLocalizedNumber(player.payment) });
      } else {
        await createPlayer({ ...player, groupId: player.groupIds[0] || '', groupIds: player.groupIds, payment: parseLocalizedNumber(player.payment) });
      }
      navigate('/players');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to save player');
    }
  };

  const filteredParents = parents.filter((parent) => [
    parent.name,
    parent.email,
    parent.phone
  ].join(' ').toLowerCase().includes(parentSearch.trim().toLowerCase()));

  const filteredGroups = groups.filter((group) => [
    group.name,
    group.days?.join(' '),
    group.startTime,
    group.endTime
  ].join(' ').toLowerCase().includes(groupSearch.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{id ? t('editPlayer') : t('addPlayer')}</h1></div>
        <div className="form-card">
          {message && <p className="alert-error">{message}</p>}
          <form onSubmit={handleSubmit}>
            <label>{t('name')}</label>
            <input name="fullName" value={player.fullName} onChange={handleChange} required />

            <label>{t('parent')}</label>
            <input className="select-search-input" type="search" value={parentSearch} onChange={(event) => setParentSearch(event.target.value)} placeholder="Search parent..." />
            <select name="parentId" value={player.parentId} onChange={handleChange} required>
              <option value="">{t('selectParent')}</option>
              {filteredParents.map((parent) => (
                <option key={parent._id} value={parent._id}>{parent.phone ? `${parent.name} (${parent.phone})` : parent.name}</option>
              ))}
            </select>

            <label>{t('parentPhone')}</label>
            <input name="parentPhone" value={player.parentPhone} onChange={handleChange} />

            <label>{t('group')}</label>
            <input className="select-search-input" type="search" value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Search group..." />
            <div className="multi-select-list">
              {filteredGroups.length ? filteredGroups.map((group) => (
                <label className="multi-select-option" key={group._id}>
                  <input
                    checked={player.groupIds.includes(group._id)}
                    onChange={() => handleGroupToggle(group._id)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{group.name}</strong>
                    <small>{[group.days?.join(', '), [group.startTime, group.endTime].filter(Boolean).join(' - ')].filter(Boolean).join(' | ')}</small>
                  </span>
                </label>
              )) : <p className="empty-state">{t('noGroupsFound')}</p>}
            </div>

            <label>{t('startDate')}</label>
            <input name="startDate" type="date" value={player.startDate} onChange={handleChange} />

            <label>{t('endDate')}</label>
            <input name="endDate" type="date" value={player.endDate} onChange={handleChange} />

            <label>{t('package')}</label>
            <select name="packageName" value={player.packageName} onChange={handleChange}>
              <option value="">{t('selectPackage')}</option>
              {packageOptions.map((option) => (
                <option key={option.label} value={option.label}>{option.label}</option>
              ))}
              <option value="custom">{t('customPackage')}</option>
            </select>

            {player.packageName === 'custom' && (
              <div className="form-inline-grid">
                <label>
                  {t('classes')}
                  <input name="packageClasses" type="number" min="0" step="1" value={player.packageClasses} onChange={handleChange} />
                </label>
                <label>
                  {t('hours')}
                  <input name="packageHours" type="number" min="0" step="0.5" value={player.packageHours} onChange={handleChange} />
                </label>
              </div>
            )}

            <label>{t('status')}</label>
            <select name="status" value={player.status} onChange={handleChange}>
              <option value="active">{t('activeStatus')}</option>
              <option value="expired">{t('expiredStatus')}</option>
              <option value="frozen">{t('frozenStatus')}</option>
              <option value="left">{t('leftStatus')}</option>
            </select>

            <label>{t('payment')}</label>
            <input name="payment" type="text" inputMode="decimal" value={player.payment} onChange={handleChange} />

            <label>{t('note')}</label>
            <textarea name="note" value={player.note} onChange={handleChange} placeholder={t('discountNotePlaceholder')} />

            <button type="submit" className="btn-primary">{t('savePlayer')}</button>
          </form>
        </div>
      </main>
    </div>
  );
};

export default PlayerFormPage;
