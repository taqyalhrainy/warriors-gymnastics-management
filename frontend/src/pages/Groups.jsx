import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchGroups, createGroup, updateGroup, deleteGroup } from '../services/groups.js';
import { confirmAction } from '../utils/confirmAction.js';

const initialForm = { name: '', days: '', startTime: '', endTime: '', maxCapacity: 20 };

const GroupsPage = () => {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');

  const loadGroups = async () => {
    try {
      setGroups(await fetchGroups());
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
      const payload = { ...form, days: form.days.split(',').map((d) => d.trim()) };
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
      maxCapacity: group.maxCapacity
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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Training Groups</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{selectedGroup ? 'Edit Group' : 'New Group'}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSubmit}>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              <label>Days (comma separated)</label>
              <input value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} required />
              <label>Start Time</label>
              <input value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
              <label>End Time</label>
              <input value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
              <label>Max Capacity</label>
              <input type="number" value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} required />
              <button className="btn-primary" type="submit">{selectedGroup ? 'Update Group' : 'Add Group'}</button>
              {selectedGroup && <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>}
            </form>
          </div>
          <div className="table-card">
            <h2>Group List</h2>
            <table className="data-table">
              <thead><tr><th>Name</th><th>Days</th><th>Time</th><th>Capacity</th><th>Actions</th></tr></thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group._id}>
                    <td>{group.name}</td>
                    <td>{group.days.join(', ')}</td>
                    <td>{group.startTime} - {group.endTime}</td>
                    <td>{group.currentCount}/{group.maxCapacity}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(group)}>Edit</button>
                      <button type="button" onClick={() => handleDelete(group._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {groups.length === 0 && <tr><td colSpan="5">No groups found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default GroupsPage;
