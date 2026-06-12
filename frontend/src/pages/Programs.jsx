import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPrograms, createProgram, updateProgram, deleteProgram } from '../services/programs.js';
import { confirmAction } from '../utils/confirmAction.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const ProgramsPage = () => {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', level: '', price: '' });
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const { t } = useLanguage();

  const loadPrograms = async () => {
    try {
      setPrograms(await fetchPrograms());
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    loadPrograms();
  }, []);

  const resetForm = () => {
    setSelectedProgram(null);
    setForm({ name: '', description: '', level: '', price: '' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedProgram) {
      const confirmed = confirmAction('تحديث البرنامج');
      if (!confirmed) return;
    }

    try {
      if (selectedProgram) {
        await updateProgram(selectedProgram._id, form);
        setMessage('Program updated successfully.');
      } else {
        await createProgram(form);
        setMessage('Program created successfully.');
      }
      resetForm();
      loadPrograms();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save program.');
    }
  };

  const handleEdit = (program) => {
    setSelectedProgram(program);
    setForm({
      name: program.name,
      description: program.description || '',
      level: program.level || '',
      price: program.price || ''
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    const confirmed = confirmAction('حذف البرنامج');
    if (!confirmed) return;

    try {
      await deleteProgram(id);
      setMessage('Program deleted successfully.');
      loadPrograms();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete program.');
    }
  };

  const filteredPrograms = programs.filter((program) => [
    program.name,
    program.level,
    program.description,
    program.price
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('programs')}</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedProgram ? t('editProgram') : t('addProgram')}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>{t('name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>{t('description')}</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label>{t('level')}</label>
              <input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
              <label>{t('price')}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                required
              />
              <button className="btn-primary" type="submit">{selectedProgram ? t('update') : t('create')}</button>
              {selectedProgram && <button type="button" className="btn-secondary" onClick={resetForm}>{t('cancel')}</button>}
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('programList')}</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search programs..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('name')}</th><th>{t('level')}</th><th>{t('description')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {filteredPrograms.length ? filteredPrograms.map((program) => (
                  <tr key={program._id}>
                    <td>{program.name}</td>
                    <td>{program.level || t('notAvailable')}</td>
                    <td>{program.description || t('noDescription')}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(program)}>{t('edit')}</button>
                      <button type="button" onClick={() => handleDelete(program._id)}>{t('delete')}</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="4">{t('noProgramsFound')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProgramsPage;
