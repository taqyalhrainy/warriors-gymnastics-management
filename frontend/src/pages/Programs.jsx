import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchPrograms, createProgram, updateProgram, deleteProgram } from '../services/programs.js';
import { confirmAction } from '../utils/confirmAction.js';

const ProgramsPage = () => {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', level: '', price: '' });
  const [message, setMessage] = useState('');

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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Programs</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedProgram ? 'Edit Program' : 'Add Program'}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label>Level</label>
              <input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} />
              <label>Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                required
              />
              <button className="btn-primary" type="submit">{selectedProgram ? 'Update' : 'Create'}</button>
              {selectedProgram && <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>}
            </form>
          </div>
          <div className="table-card">
            <h2>Program List</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Level</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                {programs.length ? programs.map((program) => (
                  <tr key={program._id}>
                    <td>{program.name}</td>
                    <td>{program.level || 'N/A'}</td>
                    <td>{program.description || 'No description'}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(program)}>Edit</button>
                      <button type="button" onClick={() => handleDelete(program._id)}>Delete</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="4">No programs found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ProgramsPage;
