import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import { fetchSubscriptions, createSubscription, updateSubscription, deleteSubscription } from '../services/subscriptions.js';
import { fetchPlayers } from '../services/players.js';
import { fetchPrograms } from '../services/programs.js';
import { confirmAction } from '../utils/confirmAction.js';
import { formatCurrency } from '../utils/format.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const SubscriptionsPage = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [players, setPlayers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [form, setForm] = useState({ playerId: '', type: 'sessions', packageName: '', totalSessions: 0, startDate: '', endDate: '', price: 0 });
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [playerSearch, setPlayerSearch] = useState('');
  const [packageSearch, setPackageSearch] = useState('');
  const { t } = useLanguage();

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

  const filteredPlayers = players.filter((player) => [
    player.fullName,
    player.parentId?.name,
    player.groupId?.name,
    player.status
  ].join(' ').toLowerCase().includes(playerSearch.trim().toLowerCase()));

  const filteredSubscriptions = subscriptions.filter((sub) => [
    sub.playerId?.fullName,
    sub.packageName,
    sub.type,
    sub.status,
    sub.remainingSessions,
    sub.daysRemaining,
    sub.price
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  const filteredPackages = packages.filter((pkg) => [
    pkg.name,
    pkg.level,
    pkg.description,
    pkg.price
  ].join(' ').toLowerCase().includes(packageSearch.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('subscriptions')}</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{t('createSubscription')}</h2>
            {error && <p className="alert-error">{error}</p>}
            <form onSubmit={handleSubmit}>
              <label>{t('player')}</label>
              <input
                className="select-search-input"
                type="search"
                value={playerSearch}
                onChange={(event) => setPlayerSearch(event.target.value)}
                placeholder="Search player..."
              />
              <select value={form.playerId} onChange={(e) => setForm({ ...form, playerId: e.target.value })} required>
                <option value="">{t('selectPlayer')}</option>
                {filteredPlayers.map((player) => (
                  <option key={player._id} value={player._id}>{player.fullName}</option>
                ))}
              </select>
              <label>{t('subscriptionType')}</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="sessions">{t('sessions')}</option>
                <option value="time">{t('timeSubscription')}</option>
              </select>
              <label>{t('packageName')}</label>
              <input
                className="select-search-input"
                type="search"
                value={packageSearch}
                onChange={(event) => setPackageSearch(event.target.value)}
                placeholder="Search package..."
              />
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
                <option value="">{t('selectPackage')}</option>
                {filteredPackages.map((pkg) => (
                  <option key={pkg._id} value={pkg.name}>{pkg.name}</option>
                ))}
              </select>
              {form.type === 'sessions' && (
                <>
                  <label>{t('totalSessions')}</label>
                  <input type="number" min="0" value={form.totalSessions} onChange={(e) => setForm({ ...form, totalSessions: Number(e.target.value) })} />
                </>
              )}
              <label>{t('startDate')}</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
              <label>{t('endDate')}</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
              <label>{t('price')}</label>
              <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
              <button className="btn-primary" type="submit">{selectedSubscription ? t('updateSubscription') : t('createSubscription')}</button>
              {selectedSubscription && <button type="button" className="btn-secondary" onClick={resetForm}>{t('cancel')}</button>}
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('subscriptions')}</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subscriptions..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('player')}</th><th>{t('package')}</th><th>{t('subscriptionType')}</th><th>{t('status')}</th><th>{t('price')}</th><th>{t('daysRemaining')}</th><th>{t('actions')}</th></tr></thead>
              <tbody>
                {filteredSubscriptions.length ? filteredSubscriptions.map((sub) => (
                  <tr key={sub._id}>
                    <td>{sub.playerId?.fullName || t('unknown')}</td>
                    <td>{sub.packageName || '—'}</td>
                    <td>{sub.type}</td>
                    <td>{sub.status}</td>
                    <td>{formatCurrency(sub.price)}</td>
                    <td>{sub.type === 'time' ? sub.daysRemaining ?? 0 : '—'}</td>
                    <td>
                      <button type="button" onClick={() => handleEdit(sub)}>{t('edit')}</button>
                      <button type="button" onClick={() => handleDelete(sub._id)}>{t('delete')}</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan="7">{t('noSubscriptionsYet')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SubscriptionsPage;
