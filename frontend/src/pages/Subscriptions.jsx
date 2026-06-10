import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchSubscriptions, createSubscription, updateSubscription, deleteSubscription } from '../services/subscriptions.js';
import { fetchPlayers } from '../services/players.js';
import { fetchPrograms } from '../services/programs.js';
import { confirmAction } from '../utils/confirmAction.js';
import { formatCurrency } from '../utils/format.js';

const SubscriptionsPage = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [form, setForm] = useState({ playerId: '', type: 'sessions', packageName: '', totalSessions: 0, startDate: '', endDate: '', price: 0 });
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setSubscriptions(await fetchSubscriptions());
      setPlayers(await fetchPlayers());
      setPackages(await fetchPrograms());
    } catch (err) {
      console.error(err);
      setError('Unable to load subscriptions, players, or packages.');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setSelectedSubscription(null);
    setForm({ playerId: '', type: 'sessions', packageName: '', totalSessions: 0, startDate: '', endDate: '', price: 0 });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (selectedSubscription) {
        const confirmed = confirmAction('تحديث الاشتراك');
        if (!confirmed) return;
        await updateSubscription(selectedSubscription._id, form);
        setError('Subscription updated successfully.');
      } else {
        await createSubscription(form);
        setError('Subscription created successfully.');
      }
      resetForm();
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to save subscription.');
    }
  };

  const handleEdit = (subscription) => {
    setSelectedSubscription(subscription);
    setForm({
      playerId: subscription.playerId?._id || '',
      type: subscription.type,
      packageName: subscription.packageName || '',
      totalSessions: subscription.totalSessions || 0,
      startDate: subscription.startDate?.split('T')[0] || '',
      endDate: subscription.endDate?.split('T')[0] || '',
      price: subscription.price || 0
    });
    setError('');
  };

  const handleDelete = async (id) => {
    const confirmed = confirmAction('حذف الاشتراك');
    if (!confirmed) return;
    try {
      await deleteSubscription(id);
      setError('Subscription deleted successfully.');
      if (selectedSubscription?._id === id) resetForm();
      loadData();
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to delete subscription.');
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Subscriptions</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>Create Subscription</h2>
            {error && <p className="alert-error">{error}</p>}
            <form onSubmit={handleSubmit}>
              <label>Player</label>
              <select value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} required>
                <option value="">Select Player</option>
                {players.map((player) => (
                  <option key={player._id} value={player._id}>{player.fullName}</option>
                ))}
              </select>
              <label>Subscription Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="sessions">Sessions</option>
                <option value="time">Time</option>
              </select>
              <label>Package Name</label>
              <select
                value={form.packageName}
                onChange={(e) => {
                  const selectedName = e.target.value;
                  const selectedProgram = packages.find((pkg) => pkg.name === selectedName);
                  setForm({
                    ...form,
                    packageName: selectedName,
                    price: selectedProgram ? Number(selectedProgram.price || 0) : form.price
                  });
                }}
                required
              >
                <option value="">Select Package</option>
                {packages.map((pkg) => (
                  <option key={pkg._id} value={pkg.name}>{pkg.name}</option>
                ))}
              </select>
              {form.type === 'sessions' && (
                <>
                  <label>Total Sessions</label>
                  <input type="number" min="0" value={form.totalSessions} onChange={(e) => setForm({ ...form, totalSessions: Number(e.target.value) })} />
                </>
              )}
              <label>Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
              <label>End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              <label>Price (د.أ)</label>
              <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
              <button className="btn-primary" type="submit">{selectedSubscription ? 'Update Subscription' : 'Create Subscription'}</button>
              {selectedSubscription && <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>}
            </form>
          </div>
          <div className="table-card">
            <h2>Subscriptions</h2>
            <table className="data-table">
              <thead><tr><th>Player</th><th>Package</th><th>Type</th><th>Status</th><th>Remaining</th><th>Days Remaining</th><th>Actions</th></tr></thead>
              <tbody>
                {subscriptions.length ? subscriptions.map((sub) => (
                  <tr key={sub._id}>
                    <td>{sub.playerId?.fullName || 'Unknown'}</td>
                    <td>{sub.packageName || '—'}</td>
                    <td>{sub.type}</td>
                    <td>{sub.status}</td>
                    <td>{sub.type === 'sessions' ? sub.remainingSessions : formatCurrency(sub.price)}</td>
                    <td>{sub.type === 'time' ? `${sub.daysRemaining ?? 0} days` : '—'}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(sub)}>Edit</button>
                      <button type="button" onClick={() => handleDelete(sub._id)}>Delete</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="7">No subscriptions yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SubscriptionsPage;
