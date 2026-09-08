import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import {
  fetchNotifications,
  sendNotification,
  announceAllParents,
  announceGroupParents,
  fetchSavedNotificationMessages,
  createSavedNotificationMessage,
  updateSavedNotificationMessage,
  deleteSavedNotificationMessage
} from '../services/notifications.js';
import { fetchParents } from '../services/parents.js';
import { fetchGroups } from '../services/groups.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const SAVED_MESSAGES_KEY = 'warriors-saved-notification-messages';
const todayInputValue = () => new Date().toISOString().split('T')[0];

const readSavedMessages = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_MESSAGES_KEY) || '[]');
  } catch (error) {
    return [];
  }
};

const normalizeSavedMessage = (item) => ({
  ...item,
  id: item._id || item.id
});

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [parents, setParents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [savedMessages, setSavedMessages] = useState(readSavedMessages);
  const [savedForm, setSavedForm] = useState({ id: '', title: '', message: '' });
  const [historyDate, setHistoryDate] = useState(todayInputValue);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ recipientUserId: '', groupId: '', title: '', message: '', type: 'announcement' });
  const [search, setSearch] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const { t } = useLanguage();
  const location = useLocation();
  const prefillNotification = location.state?.prefillNotification || null;

  const loadNotifications = useCallback((options = {}) => {
    fetchNotifications({ date: historyDate, ...options }).then(setNotifications).catch(console.error);
  }, [historyDate]);

  const loadSavedMessages = useCallback((options = {}) => {
    fetchSavedNotificationMessages(options)
      .then((items) => setSavedMessages((items || []).map(normalizeSavedMessage)))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadNotifications();
    const intervalId = window.setInterval(() => {
      loadNotifications({ force: true });
    }, 10000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications({ force: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadNotifications]);

  useEffect(() => {
    fetchParents().then(setParents).catch(console.error);
    fetchGroups().then(setGroups).catch(console.error);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const migrateLocalSavedMessages = async () => {
      try {
        const serverMessages = await fetchSavedNotificationMessages({ force: true });
        if (!isMounted) return;
        const normalizedServerMessages = (serverMessages || []).map(normalizeSavedMessage);
        setSavedMessages(normalizedServerMessages);

        const localMessages = readSavedMessages();
        if (!localMessages.length) return;

        const existingKeys = new Set(normalizedServerMessages.map((item) => `${item.title}\n${item.message}`));
        const missingLocalMessages = localMessages.filter((item) => item.title && item.message && !existingKeys.has(`${item.title}\n${item.message}`));
        if (!missingLocalMessages.length) {
          localStorage.removeItem(SAVED_MESSAGES_KEY);
          return;
        }

        await Promise.all(missingLocalMessages.map((item) => createSavedNotificationMessage({ title: item.title, message: item.message })));
        localStorage.removeItem(SAVED_MESSAGES_KEY);
        loadSavedMessages({ force: true });
      } catch (error) {
        console.error(error);
      }
    };

    migrateLocalSavedMessages();
    const intervalId = window.setInterval(() => loadSavedMessages({ force: true }), 10000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [loadSavedMessages]);

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
      loadNotifications({ force: true });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to send notification.');
    }
  };

  const handleSaveMessage = async (event) => {
    event.preventDefault();
    if (!savedForm.title.trim() || !savedForm.message.trim()) return;
    const nextMessage = {
      title: savedForm.title.trim(),
      message: savedForm.message.trim()
    };
    try {
      if (savedForm.id) {
        await updateSavedNotificationMessage(savedForm.id, nextMessage);
      } else {
        await createSavedNotificationMessage(nextMessage);
      }
      setSavedForm({ id: '', title: '', message: '' });
      loadSavedMessages({ force: true });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save message.');
    }
  };

  const handleEditSavedMessage = (item) => {
    setSavedForm({ id: item.id, title: item.title, message: item.message });
  };

  const handleDeleteSavedMessage = async (id) => {
    try {
      await deleteSavedNotificationMessage(id);
      if (savedForm.id === id) {
        setSavedForm({ id: '', title: '', message: '' });
      }
      loadSavedMessages({ force: true });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete saved message.');
    }
  };

  const applySavedMessage = (item) => {
    setForm((current) => ({ ...current, title: item.title, message: item.message }));
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
            <section className="saved-message-panel">
              <h3>Saved messages</h3>
              <form onSubmit={handleSaveMessage} className="saved-message-form">
                <input value={savedForm.title} onChange={(event) => setSavedForm({ ...savedForm, title: event.target.value })} placeholder="Saved title" />
                <textarea value={savedForm.message} onChange={(event) => setSavedForm({ ...savedForm, message: event.target.value })} placeholder="Saved message" />
                <div className="saved-message-actions">
                  <button className="btn-secondary" type="submit">{savedForm.id ? 'Update saved' : 'Add saved'}</button>
                  {savedForm.id && <button className="btn-secondary" type="button" onClick={() => setSavedForm({ id: '', title: '', message: '' })}>Cancel</button>}
                </div>
              </form>
              <div className="saved-message-list">
                {savedMessages.length ? savedMessages.map((item) => (
                  <article className="saved-message-item" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.message}</p>
                    </div>
                    <div className="saved-message-actions">
                      <button className="btn-primary" type="button" onClick={() => applySavedMessage(item)}>Use</button>
                      <button className="btn-secondary" type="button" onClick={() => handleEditSavedMessage(item)}>Edit</button>
                      <button className="btn-danger" type="button" onClick={() => handleDeleteSavedMessage(item.id)}>Delete</button>
                    </div>
                  </article>
                )) : <p className="empty-state">No saved messages yet.</p>}
              </div>
            </section>
          </div>
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('messages')}</h2>
              <label className="table-search">
                <span>Date</span>
                <input type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value || todayInputValue())} />
              </label>
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
