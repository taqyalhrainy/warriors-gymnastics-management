import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchNotifications, sendNotification, announceAllParents, announceGroupParents } from '../services/notifications.js';
import { fetchParents } from '../services/parents.js';
import { fetchGroups } from '../services/groups.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [parents, setParents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ recipientUserId: '', groupId: '', title: '', message: '', type: 'announcement' });
  const [search, setSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const { t } = useLanguage();
  const location = useLocation();
  const prefillNotification = location.state?.prefillNotification || null;

  useEffect(() => {
    fetchNotifications().then(setNotifications).catch(console.error);
    fetchParents().then(setParents).catch(console.error);
    fetchGroups().then(setGroups).catch(console.error);
  }, []);

  useEffect(() => {
    if (!prefillNotification) return;

    const recipientUserId = prefillNotification.recipientUserId
      || parents.find((parent) => parent._id === prefillNotification.parentId)?.userId?._id
      || '';

    setForm((current) => ({
      ...current,
      recipientUserId,
      groupId: '',
      title: prefillNotification.title || current.title,
      message: prefillNotification.message || current.message,
      type: prefillNotification.type || current.type
    }));
    setParentSearch(prefillNotification.parentName || '');
  }, [prefillNotification, parents]);

  const handleSend = async (e) => {
    e.preventDefault();
    try {
      if (form.recipientUserId === 'all') {
        const result = await announceAllParents({ title: form.title, message: form.message, type: form.type });
        setMessage(`Announcement sent to ${result.count} parents.`);
      } else if (form.recipientUserId === 'group') {
        const result = await announceGroupParents({ groupId: form.groupId, title: form.title, message: form.message, type: form.type });
        setMessage(`Announcement sent to ${result.count} parents in this session.`);
      } else {
        await sendNotification(form);
        setMessage('Notification sent successfully.');
      }
      setForm({ recipientUserId: '', groupId: '', title: '', message: '', type: 'announcement' });
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

  const filteredGroups = groups.filter((group) => [
    group.name,
    group.days?.join(' '),
    group.startTime,
    group.endTime
  ].join(' ').toLowerCase().includes(groupSearch.trim().toLowerCase()));

  const formatGroupLabel = (group) => [
    group.name,
    group.days?.join(', '),
    [group.startTime, group.endTime].filter(Boolean).join(' - ')
  ].filter(Boolean).join(' | ');

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
              <label>{t('recipient')}</label>
              <input
                className="select-search-input"
                type="search"
                value={parentSearch}
                onChange={(event) => setParentSearch(event.target.value)}
                placeholder="Search parent..."
              />
              <select value={form.recipientUserId} onChange={(e) => setForm({ ...form, recipientUserId: e.target.value, groupId: '' })} required>
                <option value="">{t('selectParent')}</option>
                <option value="all">{t('allParents')}</option>
                <option value="group">Parents by session</option>
                {filteredParents.map((parent) => (
                  <option key={parent._id} value={parent.userId?._id || ''}>{parent.name}</option>
                ))}
              </select>
              {form.recipientUserId === 'group' && (
                <>
                  <label>{t('group')}</label>
                  <input
                    className="select-search-input"
                    type="search"
                    value={groupSearch}
                    onChange={(event) => setGroupSearch(event.target.value)}
                    placeholder="Search session..."
                  />
                  <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} required>
                    <option value="">Select session</option>
                    {filteredGroups.map((group) => (
                      <option key={group._id} value={group._id}>{formatGroupLabel(group)}</option>
                    ))}
                  </select>
                </>
              )}
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
