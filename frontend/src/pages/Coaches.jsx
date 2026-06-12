import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchCoaches, createCoach, updateCoach, deleteCoach } from '../services/coaches.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const CoachesPage = () => {
  const [coaches, setCoaches] = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', specialization: '' });
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const { t } = useLanguage();

  const loadCoaches = async () => {
    try {
      setCoaches(await fetchCoaches());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadCoaches();
  }, []);

  const resetForm = () => {
    setSelectedCoach(null);
    setForm({ name: '', email: '', phone: '', specialization: '' });
    setMessage('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (selectedCoach) {
        await updateCoach(selectedCoach._id, form);
        setMessage('Coach updated successfully.');
      } else {
        await createCoach(form);
        setMessage('Coach added successfully.');
      }
      resetForm();
      loadCoaches();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save coach.');
    }
  };

  const handleEdit = (coach) => {
    setSelectedCoach(coach);
    setForm({ name: coach.name, email: coach.userId?.email || '', phone: coach.phone || '', specialization: coach.specialization || '' });
    setMessage('');
  };

  const handleDelete = async (id) => {
    try {
      await deleteCoach(id);
      setMessage('Coach deleted successfully.');
      loadCoaches();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete coach.');
    }
  };

  const filteredCoaches = coaches.filter((coach) => [
    coach.name,
    coach.userId?.email,
    coach.phone,
    coach.specialization
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('coaches')}</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedCoach ? t('editCoach') : t('addCoach')}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>{t('name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>{t('emailOptional')}</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label>{t('phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label>{t('specialization')}</label>
              <input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
              <button className="btn-primary" type="submit">{selectedCoach ? t('update') : t('add')}</button>
              {selectedCoach && <button type="button" className="btn-secondary" onClick={resetForm}>{t('cancel')}</button>}
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('coachList')}</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search coaches..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('name')}</th><th>{t('email')}</th><th>{t('phone')}</th><th>{t('specialization')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {filteredCoaches.length ? filteredCoaches.map((coach) => (
                  <tr key={coach._id}>
                    <td>{coach.name}</td>
                    <td>{coach.userId?.email || '—'}</td>
                    <td>{coach.phone || '—'}</td>
                    <td>{coach.specialization || '—'}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(coach)}>{t('edit')}</button>
                      <button type="button" onClick={() => handleDelete(coach._id)}>{t('delete')}</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="5">{t('noCoachesAvailable')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CoachesPage;
