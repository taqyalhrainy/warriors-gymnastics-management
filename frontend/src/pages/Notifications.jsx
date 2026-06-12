import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchNotifications, sendNotification, announceAllParents } from '../services/notifications.js';
import { fetchParents } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [parents, setParents] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ recipientUserId: '', title: '', message: '', type: 'announcement' });
  const [search, setSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const { t } = useLanguage();

  useEffect(() => {
    fetchNotifications().then(setNotifications).catch(console.error);
    fetchParents().then(setParents).catch(console.error);
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    try {
      if (form.recipientUserId === 'all') {
        const result = await announceAllParents({ title: form.title, message: form.message, type: form.type });
        setMessage(`Announcement sent to ${result.count} parents.`);
      } else {
        await sendNotification(form);
        setMessage('Notification sent successfully.');
      }
      setForm({ recipientUserId: '', title: '', message: '', type: 'announcement' });
      setNotifications(await fetchNotifications());
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to send notification.');
    }
  };

  const filteredParents = parents.filter((parent) => [
    parent.name,
    parent.email,
    parent.phone
  ].join(' ').toLowerCase().includes(parentSearch.trim().toLowerCase()));

  const filteredNotifications = notifications.filter((note) => [
    note.title,
    note.message,
    note.recipientUserId?.name,
    note.recipientUserId?.email,
    note.type,
    note.isRead ? 'read yes' : 'unread no',
    note.viewedAt
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('notifications')}</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>{t('sendAnnouncement')}</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSend}>
              <label>{t('parent')}</label>
              <input
                className="select-search-input"
                type="search"
                value={parentSearch}
                onChange={(event) => setParentSearch(event.target.value)}
                placeholder="Search parent..."
              />
              <select value={form.recipientUserId} onChange={(e) => setForm({ ...form, recipientUserId: e.target.value })} required>
                <option value="">{t('selectParent')}</option>
                <option value="all">{t('allParents')}</option>
                {filteredParents.map((parent) => (
                  <option key={parent._id} value={parent.userId?._id || ''}>{parent.name}</option>
                ))}
              </select>
              <label>{t('title')}</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <label>{t('message')}</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
              <button className="btn-primary" type="submit">{t('send')}</button>
            </form>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('messages')}</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('title')}</th><th>{t('recipient')}</th><th>{t('type')}</th><th>{t('read')}</th><th>{t('viewedAt')}</th><th>{t('action')}</th></tr></thead>
              <tbody>
                {filteredNotifications.length ? filteredNotifications.map((note) => (
                  <tr key={note._id}>
                    <td>{note.title}</td>
                    <td>{note.recipientUserId?.name || note.recipientUserId?.email || t('parent')}</td>
                    <td>{note.type}</td>
                    <td>{note.isRead ? t('yes') : t('no')}</td>
                    <td>{note.viewedAt ? new Date(note.viewedAt).toLocaleString() : '-'}</td>
                    <td><Link to={`/notifications/${note._id}`}>{t('view')}</Link></td>
                  </tr>
                )) : <tr><td colSpan="6">{t('noNotifications')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotificationsPage;
