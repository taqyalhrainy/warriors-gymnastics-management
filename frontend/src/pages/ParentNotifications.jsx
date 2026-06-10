import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { fetchNotifications } from '../services/notifications.js';

const ParentNotificationsPage = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchNotifications().then(setNotifications).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Notifications</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Title</th><th>Received</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {notifications.length ? notifications.map((note) => (
                <tr key={note._id}>
                  <td>{note.title}</td>
                  <td>{new Date(note.createdAt).toLocaleString()}</td>
                  <td>{note.isRead ? 'Read' : 'Unread'}</td>
                  <td><Link to={`/parent/notifications/${note._id}`}>Open</Link></td>
                </tr>
              )) : <tr><td colSpan="4">No notifications found.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default ParentNotificationsPage;
