import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchParents, createParent, deleteParent } from '../services/parents';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const initialForm = { name: '', email: '', phone: '', password: '', isActive: true };

const Parents = () => {
  const [parents, setParents] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { t } = useLanguage();

  const loadParents = async () => {
    try {
      const data = await fetchParents();
      setParents(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load parents.');
    }
  };

  useEffect(() => {
    loadParents();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await createParent(form);
      setMessage('Parent saved successfully.');
      setForm(initialForm);
      loadParents();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to create parent.');
    }
  };

  const handleDelete = async (id) => {
    setError('');
    const confirmed = confirmAction('حذف ولي الأمر');
    if (!confirmed) return;

    try {
      await deleteParent(id);
      setMessage('Parent removed successfully.');
      loadParents();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete parent.');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header">
          <h1>{t('parents')}</h1>
        </div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{t('addNewParent')}</h2>
            {message && <p className="alert-success">{message}</p>}
            {error && <p className="alert-error">{error}</p>}
            <form onSubmit={handleSubmit} className="form-grid">
              <label>
                {t('name')}
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>
                {t('email')}
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </label>
              <label>
                {t('phone')}
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
              </label>
              <label>
                {t('password')}
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
              </label>
              <label>
                {t('active')}
                <select value={form.isActive ? 'true' : 'false'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'true' })}>
                  <option value="true">{t('yes')}</option>
                  <option value="false">{t('no')}</option>
                </select>
              </label>
              <button type="submit" className="btn-primary">{t('saveParent')}</button>
            </form>
          </div>
          <div className="table-card">
            <h2>{t('parentList')}</h2>
            {parents.length === 0 ? (
              <p>{t('noParentsAvailable')}</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('name')}</th>
                    <th>{t('email')}</th>
                    <th>{t('phone')}</th>
                    <th>{t('active')}</th>
                    <th>{t('children')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {parents.map((parent) => (
                    <tr key={parent._id}>
                      <td>{parent.name}</td>
                      <td>{parent.email}</td>
                      <td>{parent.phone || '—'}</td>
                      <td>{parent.userId?.isActive ? t('yes') : t('no')}</td>
                      <td>{parent.children?.length || 0}</td>
                      <td>
                        <button type="button" onClick={() => handleDelete(parent._id)}>{t('delete')}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Parents;
