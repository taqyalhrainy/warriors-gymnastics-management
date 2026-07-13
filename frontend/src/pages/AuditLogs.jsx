import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import api from '../services/api.js';
import { updatePaymentPassword } from '../services/security.js';
import { useLanguage } from '../context/LanguageContext.jsx';

const initialPasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
};

const AuditLogsPage = () => {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [activeSecurityTab, setActiveSecurityTab] = useState('audit');
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [showPaymentPasswords, setShowPaymentPasswords] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
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

  const handlePasswordFormChange = (event) => {
    setPasswordForm((current) => ({
      ...current,
      [event.target.name]: event.target.value
    }));
  };

  const handlePaymentPasswordSubmit = async (event) => {
    event.preventDefault();
    setSecurityMessage('');
    setSecurityError('');

    try {
      setIsUpdatingPassword(true);
      const response = await updatePaymentPassword(passwordForm);
      setSecurityMessage(response.message || 'Payment password updated successfully.');
      setPasswordForm(initialPasswordForm);
    } catch (err) {
      setSecurityError(err.response?.data?.message || 'Unable to update payment password.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const filteredLogs = logs.filter((log) => [
    log.userId?.name,
    log.userId?.email,
    log.userId?.role,
    log.action,
    formatEntity(log),
    log.createdAt
  ].join(' ').toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="page-content">
        <div className="page-header"><h1>{t('security')}</h1></div>
        <div className="security-tabs">
          <button type="button" className={activeSecurityTab === 'audit' ? 'active' : ''} onClick={() => setActiveSecurityTab('audit')}>{t('auditLogs')}</button>
          <button type="button" className={activeSecurityTab === 'paymentPassword' ? 'active' : ''} onClick={() => setActiveSecurityTab('paymentPassword')}>Payment Password</button>
        </div>

        {activeSecurityTab === 'paymentPassword' && (
          <div className="security-card">
            <div className="security-card-heading">
              <div>
                <h2>Change payment password</h2>
                <p>Admins must enter this password before viewing today's payment records.</p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowPaymentPasswords((current) => !current)}
              >
                {showPaymentPasswords ? 'Hide' : 'Show'}
              </button>
            </div>
            {securityMessage && <p className="alert-info">{securityMessage}</p>}
            {securityError && <p className="alert-error">{securityError}</p>}
            <form className="security-password-form" onSubmit={handlePaymentPasswordSubmit}>
              <label>
                <span>Old payment password</span>
                <input
                  type={showPaymentPasswords ? 'text' : 'password'}
                  name="oldPassword"
                  value={passwordForm.oldPassword}
                  onChange={handlePasswordFormChange}
                  required
                />
              </label>
              <label>
                <span>New payment password</span>
                <input
                  type={showPaymentPasswords ? 'text' : 'password'}
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordFormChange}
                  required
                />
              </label>
              <label>
                <span>Confirm new password</span>
                <input
                  type={showPaymentPasswords ? 'text' : 'password'}
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordFormChange}
                  required
                />
              </label>
              <button className="btn-primary" type="submit" disabled={isUpdatingPassword}>
                {isUpdatingPassword ? 'Saving...' : 'Update Payment Password'}
              </button>
            </form>
          </div>
        )}

        {activeSecurityTab === 'audit' && (
          <div className="table-card">
            <div className="table-toolbar">
              <h2>{t('auditLogs')}</h2>
              <label className="table-search">
                <span>Search</span>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search audit logs..." />
              </label>
            </div>
            <table className="data-table">
              <thead><tr><th>{t('actor')}</th><th>{t('action')}</th><th>{t('entity')}</th><th>{t('date')}</th></tr></thead>
              <tbody>
                {filteredLogs.length ? filteredLogs.map((log) => (
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
        )}
      </main>
    </div>
  );
};

export default AuditLogsPage;
