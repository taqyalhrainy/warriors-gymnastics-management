import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchGroups, createGroup, updateGroup, deleteGroup } from '../services/groups.js';
import { fetchPackageOptions, createPackageOption, updatePackageOption, deletePackageOption } from '../services/packageOptions.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { normalizeDigits, parseLocalizedNumber } from '../utils/numberInput.js';

const initialForm = { name: '', days: '', startTime: '', endTime: '', maxCapacity: 20, color: '#2563eb' };
const initialPackageForm = { name: '', classes: '', hours: '' };

const GroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [packageForm, setPackageForm] = useState(initialPackageForm);
  const [message, setMessage] = useState('');
  const [packageMessage, setPackageMessage] = useState('');
  const [search, setSearch] = useState('');
  const [packageSearch, setPackageSearch] = useState('');
  const { t } = useLanguage();

  const loadGroups = async () => {
    try {
      setGroups(await fetchGroups());
    } catch (error) {
      console.error(error);
    }
  };

  const loadPackages = async () => {
    try {
      setPackages(await fetchPackageOptions());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadGroups();
    loadPackages();
  }, []);

  const resetForm = () => {
    setSelectedGroup(null);
    setForm(initialForm);
    setMessage('');
  };

  const resetPackageForm = () => {
    setSelectedPackage(null);
    setPackageForm(initialPackageForm);
    setPackageMessage('');
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
        maxCapacity: parseLocalizedNumber(form.maxCapacity),
        color: form.color
      };
      if (selectedGroup) {
        await updateGroup(selectedGroup._id, payload);
        setMessage('Group updated successfully.');
      } else {
        await createGroup(payload);
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

  const handlePackageSubmit = async (e) => {
    e.preventDefault();
    if (selectedPackage) {
      const confirmed = confirmAction('update package');
      if (!confirmed) return;
    }

    try {
      const payload = {
        name: packageForm.name,
        classes: parseLocalizedNumber(packageForm.classes),
        hours: parseLocalizedNumber(packageForm.hours)
      };
      if (selectedPackage) {
        await updatePackageOption(selectedPackage._id, payload);
        setPackageMessage('Package updated successfully.');
      } else {
        await createPackageOption(payload);
        setPackageMessage('Package added successfully.');
      }
      resetPackageForm();
      loadPackages();
    } catch (error) {
      setPackageMessage(error.response?.data?.message || 'Unable to save package.');
    }
  };

  const handlePackageEdit = (pkg) => {
    setSelectedPackage(pkg);
    setPackageForm({
      name: pkg.name,
      classes: pkg.classes ?? '',
      hours: pkg.hours ?? ''
    });
    setPackageMessage('');
  };

  const handlePackageDelete = async (id) => {
    const confirmed = confirmAction('delete package');
    if (!confirmed) return;

    try {
      await deletePackageOption(id);
      setPackageMessage('Package deleted successfully.');
      if (selectedPackage?._id === id) resetPackageForm();
      loadPackages();
    } catch (error) {
      setPackageMessage(error.response?.data?.message || 'Unable to delete package.');
    }
  };

  const filteredPackages = packages.filter((pkg) => [
    pkg.name,
    pkg.classes,
    pkg.hours
  ].join(' ').toLowerCase().includes(packageSearch.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Group & Package</h1></div>
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
        <div className="grid-two groups-package-section">
          <div className="form-card">
            <h2>{selectedPackage ? 'Edit Package' : 'New Package'}</h2>
            {packageMessage && <p className="alert-info">{packageMessage}</p>}
            <form onSubmit={handlePackageSubmit}>
              <label>{t('name')}</label>
              <input value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} required />
              <label>{t('classes')}</label>
              <input
                type="text"
                inputMode="numeric"
                value={packageForm.classes}
                onChange={(e) => setPackageForm({ ...packageForm, classes: normalizeDigits(e.target.value) })}
                required
              />
              <label>{t('hours')}</label>
              <input
                type="text"
                inputMode="decimal"
                value={packageForm.hours}
                onChange={(e) => setPackageForm({ ...packageForm, hours: normalizeDigits(e.target.value) })}
                required
              />
              <button className="btn-primary" type="submit">{selectedPackage ? 'Update Package' : 'Add Package'}</button>
              {selectedPackage && <button type="button" className="btn-secondary" onClick={resetPackageForm}>{t('cancel')}</button>}
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>Package List</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={packageSearch} onChange={(event) => setPackageSearch(event.target.value)} placeholder="Search packages..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('name')}</th><th>{t('classes')}</th><th>{t('hours')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {filteredPackages.length ? filteredPackages.map((pkg) => (
                  <tr key={pkg._id}>
                    <td>{pkg.name}</td>
                    <td>{pkg.classes ?? 0}</td>
                    <td>{pkg.hours ?? 0}</td>
                    <td>
                      <button type="button" onClick={() => handlePackageEdit(pkg)}>{t('edit')}</button>
                      <button type="button" onClick={() => handlePackageDelete(pkg._id)}>{t('delete')}</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="4">{t('selectPackage')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GroupsPage;
