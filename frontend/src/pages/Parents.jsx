import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { useSectionLoader, canShowEmpty } from '../hooks/useSectionLoader.js';
import { fetchParentsPage, createParent, updateParent, deleteParent } from '../services/parents';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const initialForm = { name: '', phone: '', password: '', isActive: true };
const PARENT_PAGE_SIZE = 20;

const Parents = () => {
  const { states: loadStates, load: loadSection } = useSectionLoader(["parents"]);
  const [parents, setParents] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedParent, setSelectedParent] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [parentsTotal, setParentsTotal] = useState(0);
  const [parentsPage, setParentsPage] = useState(1);
  const [parentsHasMore, setParentsHasMore] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useLanguage();

  const loadParents = async (page = 1, append = false) => {
    return loadSection('parents', () => fetchParentsPage({
      page,
      limit: PARENT_PAGE_SIZE,
      search: search.trim()
    }), (data) => {
      const rows = data?.items || [];
      setParents((current) => (append ? [...current, ...rows] : rows));
      setParentsTotal(data?.total || rows.length);
      setParentsPage(data?.page || page);
      setParentsHasMore(Boolean(data?.hasMore));
    });
  };

  useEffect(() => {
    loadParents(1, false);
  }, [search]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.name.trim() || (!selectedParent && !form.password)) {
      setError(selectedParent ? 'Name is required.' : 'Name and password are required.');
      return;
    }
    try {
      if (selectedParent) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await updateParent(selectedParent._id, payload);
        setMessage('Parent updated successfully.');
      } else {
        await createParent(form);
        setMessage('Parent saved successfully.');
      }
      setForm(initialForm);
      setSelectedParent(null);
      setShowPassword(false);
      loadParents(1, false);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save parent.');
    }
  };

  const handleEdit = (parent) => {
    setSelectedParent(parent);
    setForm({
      name: parent.name || '',
      phone: parent.phone || '',
      password: '',
      isActive: parent.userId?.isActive !== false
    });
    setShowPassword(false);
    setError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setSelectedParent(null);
    setForm(initialForm);
    setShowPassword(false);
    setError('');
    setMessage('');
  };

  const handleDelete = async (id) => {
    setError('');
    const confirmed = confirmAction('حذف ولي الأمر');
    if (!confirmed) return;

    try {
      await deleteParent(id);
      setMessage('Parent removed successfully.');
      if (selectedParent?._id === id) resetForm();
      loadParents(1, false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete parent.');
    }
  };

  const filteredParents = parents.filter((parent) => [
    parent.name,
    parent.phone,
    parent.userId?.isActive ? 'active yes' : 'inactive no',
    parent.childrenCount ?? parent.children?.length
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('parents')}</h1>
        </div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedParent ? 'Edit Parent' : t('addNewParent')}</h2>
            {message && <p className="alert-success">{message}</p>}
            {error && <p className="alert-error">{error}</p>}
            <form onSubmit={handleSubmit} className="form-grid">
              <label>
                {t('name')}
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                {t('phone')}
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label>
                {t('password')}
                <div className="password-input-row">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={selectedParent ? 'Leave blank to keep current password' : ''}
                    required={!selectedParent}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? 'Hide' : 'View'}
                  </button>
                </div>
              </label>
              <label>
                {t('active')}
                <select value={form.isActive ? 'true' : 'false'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
                  <option value="true">{t('yes')}</option>
                  <option value="false">{t('no')}</option>
                </select>
              </label>
              <button type="submit" className="btn-primary">{selectedParent ? 'Update Parent' : t('saveParent')}</button>
              {selectedParent && <button type="button" className="btn-secondary" onClick={resetForm}>{t('cancel')}</button>}
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('parentList')}</h2>
              <p className="table-filter-count">{loadStates.parents.ready ? `${filteredParents.length} of ${parentsTotal || parents.length}` : '...'}</p>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search parents..." />
              </label>
            </div>
            <DataStatus state={loadStates.parents} retry={() => loadParents(1, false)} />
            {filteredParents.length === 0 ? (
              canShowEmpty(loadStates.parents) && <p>{t('noParentsAvailable')}</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('phone')}</th>
                    <th>{t('active')}</th>
                    <th>{t('children')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParents.map((parent) => (
                    <tr key={parent._id}>
                      <td>{parent.name}</td>
                      <td>{parent.phone || '—'}</td>
                      <td>{parent.userId?.isActive ? t('yes') : t('no')}</td>
                      <td>{parent.childrenCount ?? parent.children?.length ?? 0}</td>
                      <td className="table-actions">
                        <button type="button" onClick={() => handleEdit(parent)}>{t('edit')}</button>
                        <button type="button" onClick={() => handleDelete(parent._id)}>{t('delete')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {parentsHasMore && (
              <div className="show-more-row">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={loadStates.parents.loading}
                  onClick={() => loadParents(parentsPage + 1, true)}
                >
                  Show more
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Parents;
