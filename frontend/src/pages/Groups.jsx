import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchGroups, createGroup, updateGroup, deleteGroup } from '../services/groups.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';
import { applyGroupPreferences, saveGroupColor } from '../utils/groupPreferences.js';

const initialForm = { name: '', days: '', startTime: '', endTime: '', maxCapacity: 20, color: '#2563eb' };

const GroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const { t } = useLanguage();

  const loadGroups = async () => {
    try {
      const loadedGroups = await fetchGroups();
      setGroups(applyGroupPreferences(loadedGroups));
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => { loadGroups(); }, []);

  const resetForm = () => {
    setSelectedGroup(null);
    setForm(initialForm);
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedGroup) {
      const confirmed = confirmAction('تحديث المجموعة');
      if (!confirmed) return;
    }

    try {
      const payload = {
        name: form.name,
        days: form.days.split(',').map((d) => d.trim()),
        startTime: form.startTime,
        endTime: form.endTime,
        maxCapacity: parseLocalizedNumber(form.maxCapacity)
      };
      if (selectedGroup) {
        await updateGroup(selectedGroup._id, payload);
        saveGroupColor(selectedGroup._id, form.color);
        setMessage('Group updated successfully.');
      } else {
        const createdGroup = await createGroup(payload);
        saveGroupColor(createdGroup._id, form.color);
        setMessage('Group added successfully.');
      }
      resetForm();
      loadGroups();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save group.');
    }
  };

  const handleEdit = (group) => {
    setSelectedGroup(group);
    setForm({
      name: group.name,
      days: group.days.join(', '),
      startTime: group.startTime,
      endTime: group.endTime,
      maxCapacity: group.maxCapacity,
      color: group.color || '#2563eb'
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    const confirmed = confirmAction('حذف المجموعة');
    if (!confirmed) return;

    try {
      await deleteGroup(id);
      setMessage('Group deleted successfully.');
      if (selectedGroup?._id === id) resetForm();
      loadGroups();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete group.');
    }
  };

  const filteredGroups = groups.filter((group) => [
    group.name,
    group.days?.join(' '),
    group.startTime,
    group.endTime,
    group.color,
    group.currentCount,
    group.maxCapacity
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('trainingGroups')}</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedGroup ? t('editGroup') : t('newGroup')}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>{t('name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>{t('daysCommaSeparated')}</label>
              <input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required />
              <label>{t('startTime')}</label>
              <input value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
              <label>{t('endTime')}</label>
              <input value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
              <label>{t('maxCapacity')}</label>
              <input type="text" inputMode="numeric" value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: normalizeDigits(e.target.value) })} required />
              <label>Group Color</label>
              <div className="group-color-input">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} aria-label="Group color" />
                <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} pattern="#[0-9a-fA-F]{6}" required />
              </div>
              <button className="btn-primary" type="submit">{selectedGroup ? t('updateGroup') : t('addGroup')}</button>
              {selectedGroup && <button type="button" className="btn-secondary" onClick={resetForm}>{t('cancel')}</button>}
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('groupList')}</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search groups..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('name')}</th><th>Color</th><th>{t('days')}</th><th>{t('time')}</th><th>{t('capacity')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {filteredGroups.map((group) => (
                  <tr key={group._id}>
                    <td>{group.name}</td>
                    <td>
                      <span className="group-color-preview">
                        <i style={{ background: group.color }} />
                        {group.color}
                      </span>
                    </td>
                    <td>{group.days.join(', ')}</td>
                    <td>{group.startTime} - {group.endTime}</td>
                    <td>{group.currentCount}/{group.maxCapacity}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(group)}>{t('edit')}</button>
                      <button type="button" onClick={() => handleDelete(group._id)}>{t('delete')}</button>
                    </td>
                  </tr>
                ))}
                {filteredGroups.length === 0 && <tr><td colSpan="6">{t('noGroupsFound')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GroupsPage;
