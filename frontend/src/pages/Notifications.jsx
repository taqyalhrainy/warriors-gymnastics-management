import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchNotifications, sendNotification, announceAllParents } from '../services/notifications.js';
import { fetchParents } from '../services/parents.js';

const NotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [parents, setParents] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ recipientUserId: '', title: '', message: '', type: 'announcement' });

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

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Notifications</h1></div>
        <div className="grid-two">
          <div className="form-card">
            <h2>Send Announcement</h2>
            {message && <p className="alert-info">{message}</p>}
            <form onSubmit={handleSend}>
              <label>Parent</label>
              <select value={form.recipientUserId} onChange={(e) => setForm({ ...form, recipientUserId: e.target.value })} required>
                <option value="">Select Parent</option>
                <option value="all">All Parents</option>
                {parents.map((parent) => (
                  <option key={parent._id} value={parent.userId?._id || ''}>{parent.name}</option>
                ))}
              </select>
              <label>Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              <label>Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
              <button className="btn-primary" type="submit">Send</button>
            </form>
          </div>
          <div className="table-card">
            <h2>Messages</h2>
            <table className="data-table">
              <thead><tr><th>Title</th><th>Recipient</th><th>Type</th><th>Read</th><th>Viewed At</th><th>Action</th></tr></thead>
              <tbody>
                {notifications.length ? notifications.map((note) => (
                  <tr key={note._id}>
                    <td>{note.title}</td>
                    <td>{note.recipientUserId?.name || note.recipientUserId?.email || 'Parent'}</td>
                    <td>{note.type}</td>
                    <td>{note.isRead ? 'Yes' : 'No'}</td>
                    <td>{note.viewedAt ? new Date(note.viewedAt).toLocaleString() : '-'}</td>
                    <td><Link to={`/notifications/${note._id}`}>View</Link></td>
                  </tr>
                )) : <tr><td colSpan="6">No notifications.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotificationsPage;
