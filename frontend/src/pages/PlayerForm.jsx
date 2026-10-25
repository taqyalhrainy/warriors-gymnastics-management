import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { useSectionLoader, canShowEmpty } from '../hooks/useSectionLoader.js';
import { createPlayer, updatePlayer, getPlayer } from '../services/players.js';
import { fetchGroups } from '../services/groups.js';
import { fetchParents } from '../services/parents.js';
import { fetchPackageOptions } from '../services/packageOptions.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';
import { compressProfileImage } from '../utils/imageUpload.js';

const SUBSCRIPTION_DAY_OPTIONS = [
  ['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]
];
const DAY_INDEXES = {
  sunday: 0, sun: 0, 'الأحد': 0,
  monday: 1, mon: 1, 'الاثنين': 1, 'الإثنين': 1,
  tuesday: 2, tue: 2, tues: 2, 'الثلاثاء': 2,
  wednesday: 3, wed: 3, 'الأربعاء': 3,
  thursday: 4, thu: 4, thurs: 4, 'الخميس': 4,
  friday: 5, fri: 5, 'الجمعة': 5,
  saturday: 6, sat: 6, 'السبت': 6
};

const getDayIndex = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const exact = DAY_INDEXES[normalized];
  if (Number.isInteger(exact)) return exact;
  const match = Object.entries(DAY_INDEXES).find(([day]) => normalized.includes(day));
  return match?.[1];
};

const calculateEndDate = (form, groups) => {
  const totalClasses = Number(form.packageClasses || 0);
  const days = form.subscriptionScheduleMode === 'custom'
    ? form.subscriptionCustomDays
    : form.groupIds.flatMap((groupId) => {
      const group = groups.find((item) => item._id === groupId);
      return (group?.days || []).flatMap((value) => String(value).split(/[\/,|]+/)).map(getDayIndex);
    }).filter(Number.isInteger);
  if (!form.startDate || totalClasses <= 0 || !days.length) return form.endDate;

  const [year, month, day] = form.startDate.split('-').map(Number);
  const endDate = new Date(year, month - 1, day);
  if (Number.isNaN(endDate.getTime())) return form.endDate;
  const scheduledDays = new Set(days);
  let counted = 0;
  while (counted < totalClasses) {
    if (scheduledDays.has(endDate.getDay())) counted += 1;
    if (counted < totalClasses) endDate.setDate(endDate.getDate() + 1);
  }
  return `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
};

const PlayerFormPage = () => {
  const { states: loadStates, load: loadSection } = useSectionLoader(["parents","groups","packages"]);
  const { id } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState({
    fullName: '',
    dateOfBirth: '',
    profileImage: '',
    parentId: '',
    parentPhone: '',
    groupId: '',
    groupIds: [],
    startDate: '',
    endDate: '',
    packageName: '',
    packageClasses: '',
    packageHours: '',
    subscriptionScheduleMode: 'auto',
    subscriptionCustomDays: [],
    payment: '',
    note: '',
    makeupClassesNote: '',
    freezeNote: '',
    status: 'active'
  });
  const [parents, setParents] = useState([]);
  const [currentParent, setCurrentParent] = useState(null);
  const [groups, setGroups] = useState([]);
  const [packageOptions, setPackageOptions] = useState([]);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [parentSearch, setParentSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const { t } = useLanguage();

  const getAge = (dateOfBirth) => {
    if (!dateOfBirth) return '';
    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return age >= 0 ? age : '';
  };

  useEffect(() => {
    loadSection('parents', fetchParents, setParents);
    loadSection('groups', fetchGroups, setGroups);
    loadSection('packages', fetchPackageOptions, setPackageOptions);

    if (id) {
      loadSection('player', () => getPlayer(id), (data) => {
        const parentId = data.parentId?._id || data.parentId || '';
        if (data.parentId && typeof data.parentId === 'object') {
          setCurrentParent({
            ...data.parentId,
            phone: data.parentPhone || data.parentId.phone || ''
          });
        }
        setPlayer({
          __v: data.__v,
          fullName: data.fullName,
          dateOfBirth: data.dateOfBirth?.split('T')[0] || '',
          profileImage: data.profileImage || '',
          parentId,
          parentPhone: data.parentPhone || '',
          groupId: data.groupId?._id || '',
          groupIds: data.groupIds?.length ? data.groupIds.map((group) => group._id || group) : (data.groupId?._id ? [data.groupId._id] : []),
          startDate: data.startDate?.split('T')[0] || '',
          endDate: data.endDate?.split('T')[0] || '',
          packageName: data.packageName || '',
          packageClasses: data.packageClasses || '',
          packageHours: data.packageHours || '',
          subscriptionScheduleMode: data.subscriptionScheduleMode === 'custom' ? 'custom' : 'auto',
          subscriptionCustomDays: Array.isArray(data.subscriptionCustomDays) ? data.subscriptionCustomDays.map(Number) : [],
          payment: data.payment ?? '',
          note: data.note || '',
          makeupClassesNote: data.makeupClassesNote || '',
          freezeNote: data.freezeNote || '',
          status: data.status || 'active'
        });
      });
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
      const next = {
        ...player,
        packageName: value,
        packageClasses: selectedPackage ? selectedPackage.classes : '',
        packageHours: selectedPackage ? selectedPackage.hours : ''
      };
      setPlayer({ ...next, endDate: calculateEndDate(next, groups) });
      return;
    }
    if (name === 'payment') {
      setPlayer({ ...player, payment: normalizeDigits(value) });
      return;
    }
    if (name === 'packageClasses' || name === 'packageHours') {
      const next = { ...player, [name]: normalizeDigits(value) };
      setPlayer(name === 'packageClasses' ? { ...next, endDate: calculateEndDate(next, groups) } : next);
      return;
    }
    if (name === 'startDate') {
      const next = { ...player, startDate: value };
      setPlayer({ ...next, endDate: calculateEndDate(next, groups) });
      return;
    }
    setPlayer({ ...player, [name]: value });
  };

  const handleProfileImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const profileImage = await compressProfileImage(file);
      setPlayer((current) => ({ ...current, profileImage }));
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Unable to load image.');
    }
  };

  const handleGroupToggle = (groupId) => {
    setPlayer((current) => {
      const nextGroupIds = current.groupIds.includes(groupId)
        ? current.groupIds.filter((id) => id !== groupId)
        : [...current.groupIds, groupId];
      const next = { ...current, groupIds: nextGroupIds, groupId: nextGroupIds[0] || '' };
      return { ...next, endDate: calculateEndDate(next, groups) };
    });
  };

  const handleScheduleModeChange = (subscriptionScheduleMode) => {
    setPlayer((current) => {
      const next = { ...current, subscriptionScheduleMode };
      return { ...next, endDate: calculateEndDate(next, groups) };
    });
  };

  const handleCustomDayToggle = (dayIndex) => {
    setPlayer((current) => {
      const subscriptionCustomDays = current.subscriptionCustomDays.includes(dayIndex)
        ? current.subscriptionCustomDays.filter((day) => day !== dayIndex)
        : [...current.subscriptionCustomDays, dayIndex].sort((first, second) => first - second);
      const next = { ...current, subscriptionCustomDays };
      return { ...next, endDate: calculateEndDate(next, groups) };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) {
      return;
    }

    setMessage('');
    if (player.subscriptionScheduleMode === 'custom' && !player.subscriptionCustomDays.length) {
      setMessage('Choose at least one custom attendance day.');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...player,
        groupId: player.groupIds[0] || '',
        groupIds: player.groupIds,
        packageClasses: parseLocalizedNumber(player.packageClasses),
        packageHours: parseLocalizedNumber(player.packageHours),
        payment: parseLocalizedNumber(player.payment)
      };

      if (id && !payload.parentId) {
        delete payload.parentId;
      }

      if (id) {
        await updatePlayer(id, payload);
      } else {
        await createPlayer(payload);
      }
      navigate('/players');
    } catch (err) {
      setMessage(err.response?.data?.message || 'Unable to save player');
    } finally {
      setIsSaving(false);
    }
  };

  const parentOptions = currentParent && !parents.some((parent) => parent._id === currentParent._id)
    ? [currentParent, ...parents]
    : parents;

  const filteredParents = parentOptions.filter((parent) => parent._id === player.parentId || [
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
          <DataStatus state={loadStates.player} />
          <DataStatus state={loadStates.parents} />
          <DataStatus state={loadStates.groups} />
          <DataStatus state={loadStates.packages} />
          <form onSubmit={handleSubmit}>
          <fieldset disabled={Boolean(id && !canShowEmpty(loadStates.player))} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <label>{t('name')}</label>
            <input name="fullName" value={player.fullName} onChange={handleChange} required />

            <div className="player-form-photo-row">
              <div className="player-avatar is-large">
                {player.profileImage ? <img src={player.profileImage} alt="" /> : <span>{player.fullName?.charAt(0) || '?'}</span>}
              </div>
              <label>
                Profile picture
                <input type="file" accept="image/*" onChange={handleProfileImageChange} />
              </label>
              {player.profileImage && (
                <button type="button" className="btn-secondary" onClick={() => setPlayer((current) => ({ ...current, profileImage: '' }))}>
                  Remove picture
                </button>
              )}
            </div>

            <label>{t('dateOfBirth')}</label>
            <input name="dateOfBirth" type="date" value={player.dateOfBirth} onChange={handleChange} />
            {player.dateOfBirth && <p className="form-help">Age: {getAge(player.dateOfBirth)}</p>}

            <label>{t('parent')}</label>
            <input className="select-search-input" type="search" value={parentSearch} onChange={(event) => setParentSearch(event.target.value)} placeholder="Search parent..." />
            <select name="parentId" value={player.parentId} onChange={handleChange} required={!id}>
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
              )) : canShowEmpty(loadStates.groups) ? <p className="empty-state">{t('noGroupsFound')}</p> : <DataStatus state={loadStates.groups} />}
            </div>

            <label>{t('startDate')}</label>
            <input name="startDate" type="date" value={player.startDate} onChange={handleChange} />

            <label>{t('endDate')}</label>
            <input name="endDate" type="date" value={player.endDate} onChange={handleChange} />

            <div className="subscription-schedule-box player-edit-schedule-box">
              <div>
                <strong>Attendance schedule</strong>
                <small>Change the weekly days and calculated end date.</small>
              </div>
              <div className="subscription-schedule-toggle">
                <button
                  type="button"
                  className={player.subscriptionScheduleMode === 'auto' ? 'is-active' : ''}
                  onClick={() => handleScheduleModeChange('auto')}
                >
                  Auto from groups
                </button>
                <button
                  type="button"
                  className={player.subscriptionScheduleMode === 'custom' ? 'is-active' : ''}
                  onClick={() => handleScheduleModeChange('custom')}
                >
                  Custom days
                </button>
              </div>
              {player.subscriptionScheduleMode === 'custom' && (
                <div className="subscription-day-picker" aria-label="Player subscription days">
                  {SUBSCRIPTION_DAY_OPTIONS.map(([label, dayIndex]) => (
                    <button
                      key={dayIndex}
                      type="button"
                      className={player.subscriptionCustomDays.includes(dayIndex) ? 'is-active' : ''}
                      onClick={() => handleCustomDayToggle(dayIndex)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                  <input name="packageClasses" type="text" inputMode="numeric" value={player.packageClasses} onChange={handleChange} />
                </label>
                <label>
                  {t('hours')}
                  <input name="packageHours" type="text" inputMode="decimal" value={player.packageHours} onChange={handleChange} />
                </label>
              </div>
            )}

            <label>{t('status')}</label>
            <select name="status" value={player.status} onChange={handleChange}>
              <option value="active">{t('activeStatus')}</option>
              <option value="expired">{t('expiredStatus')}</option>
              <option value="frozen">{t('frozenStatus')}</option>
              <option value="tryout">{t('tryoutStatus')}</option>
              <option value="left">{t('leftStatus')}</option>
            </select>

            <label>{t('payment')}</label>
            <input name="payment" type="text" inputMode="decimal" value={player.payment} onChange={handleChange} />

            <label>{t('note')}</label>
            <textarea name="note" value={player.note} onChange={handleChange} placeholder={t('discountNotePlaceholder')} />

            {(player.status === 'frozen' || player.freezeNote) && (
              <>
                <label>Freeze</label>
                <textarea name="freezeNote" value={player.freezeNote} onChange={handleChange} />
              </>
            )}

            <label>{t('makeupClasses')}</label>
            <textarea name="makeupClassesNote" value={player.makeupClassesNote} onChange={handleChange} />

            <button type="submit" className="btn-primary" disabled={isSaving}>
              {isSaving ? 'Saving...' : t('savePlayer')}
            </button>
          </fieldset>
          </form>
        </div>
      </main>
    </div>
  );
};

export default PlayerFormPage;
