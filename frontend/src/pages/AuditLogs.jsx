import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const { t } = useLanguage();

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
        <div className="page-header"><h1>{t('auditLogs')}</h1></div>
        <div className="table-card">
          <table className="data-table">
            <thead><tr><th>{t('actor')}</th><th>{t('action')}</th><th>{t('entity')}</th><th>{t('date')}</th></tr></thead>
            <tbody>
              {logs.length ? logs.map((log) => (
                <tr key={log._id}>
                  <td>
                    {log.userId ? (
                      `${log.userId.name || log.userId.email || log.userId}${log.userId.role ? ` (${log.userId.role})` : ''}`
                    ) : t('system')}
                  </td>
                  <td>{log.action}</td>
                  <td>{formatEntity(log)}</td>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                </tr>
              )) : <tr><td colSpan="4">{t('noAuditLogsFound')}</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default AuditLogsPage;
