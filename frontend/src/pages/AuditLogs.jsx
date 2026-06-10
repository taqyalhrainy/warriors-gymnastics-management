import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api.js';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);

  const formatEntity = (log) => {
    if (log.entity === 'User' && log.userId?.role) {
      const role = String(log.userId.role).toLowerCase();
      return role === 'admin' ? 'Admin' : `${log.userId.role} User`;
    }
    return log.entity;
  };

  useEffect(() => {
    api.get('/audit-logs').then((res) => setLogs(res.data)).catch(console.error);
  }, []);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>Audit Logs</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>Actor</th><th>Action</th><th>Entity</th><th>Date</th></tr></thead>
            <tbody>
              {logs.length ? logs.map((log) => (
                <tr key={log._id}>
                  <td>
                    {log.userId ? (
                      `${log.userId.name || log.userId.email || log.userId}${log.userId.role ? ` (${log.userId.role})` : ''}`
                    ) : 'System'}
                  </td>
                  <td>{log.action}</td>
                  <td>{formatEntity(log)}</td>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan="4">No audit logs found</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default AuditLogsPage;
