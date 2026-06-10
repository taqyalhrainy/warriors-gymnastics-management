import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchCoaches, createCoach, updateCoach, deleteCoach } from '../services/coaches.js';

const CoachesPage = () => {
  const [coaches, setCoaches] = useState([]);
  const [selectedCoach, setSelectedCoach] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', specialization: '' });
  const [message, setMessage] = useState('');

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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Coaches</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedCoach ? 'Edit Coach' : 'Add Coach'}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>Email (optional)</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label>Specialization</label>
              <input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
              <button className="btn-primary" type="submit">{selectedCoach ? 'Update' : 'Add'}</button>
              {selectedCoach && <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>}
            </form>
          </div>
          <div className="table-card">
            <h2>Coach List</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Specialization</th><th>Actions</th></tr></thead>
              <tbody>
                {coaches.length ? coaches.map((coach) => (
                  <tr key={coach._id}>
                    <td>{coach.name}</td>
                    <td>{coach.userId?.email || '—'}</td>
                    <td>{coach.phone || '—'}</td>
                    <td>{coach.specialization || '—'}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(coach)}>Edit</button>
                      <button type="button" onClick={() => handleDelete(coach._id)}>Delete</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="5">No coaches available.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default CoachesPage;
