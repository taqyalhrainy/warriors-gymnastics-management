import { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar.jsx';
import DataStatus from '../components/DataStatus.jsx';
import { useSectionLoader, canShowEmpty } from '../hooks/useSectionLoader.js';
import api from '../services/api.js';
import { updatePaymentPassword } from '../services/security.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import AdminAccountSecurity from '../components/AdminAccountSecurity.jsx';

const initialPasswordForm = {
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
};

const AuditLogsPage = ({ theme, changeTheme }) => {
  const { states: loadStates, load: loadSection } = useSectionLoader(["logs"]);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [activeSecurityTab, setActiveSecurityTab] = useState('general');
  const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
  const [showPaymentPasswords, setShowPaymentPasswords] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const { language, changeLanguage, t } = useLanguage();
  const { user } = useAuth();
  const copy = language === 'ar' ? {
    general: 'عام',
    accountSecurity: 'أمان الحساب',
    paymentSecurity: 'أمان الدفعات',
    preferences: 'تفضيلات العرض',
    preferencesDescription: 'اختر لغة لوحة الإدارة ومظهرها على هذا الجهاز.',
    language: 'اللغة',
    english: 'English',
    arabic: 'العربية',
    appearance: 'المظهر',
    light: 'فاتح',
    dark: 'داكن',
    selected: 'محدد'
  } : {
    general: 'General',
    accountSecurity: 'Account Security',
    paymentSecurity: 'Payment Security',
    preferences: 'Display preferences',
    preferencesDescription: 'Choose the admin dashboard language and appearance for this device.',
    language: 'Language',
    english: 'English',
    arabic: 'العربية',
    appearance: 'Appearance',
    light: 'Light',
    dark: 'Dark',
    selected: 'Selected'
  };

  const formatEntity = (log) => {
    if (log.entity === 'User' && log.userId?.role) {
      const role = String(log.userId.role).toLowerCase();
      return role === 'admin' ? 'Admin' : `${log.userId.role} User`;
    }
    return log.entity;
  };

  useEffect(() => {
    loadSection('logs', () => api.get('/audit-logs'), (res) => setLogs(res.data));
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
        <div className="page-header"><h1>{t('settings')}</h1></div>
        <div className="security-tabs">
          <button type="button" className={activeSecurityTab === 'general' ? 'active' : ''} onClick={() => setActiveSecurityTab('general')}>{copy.general}</button>
          {user?.role === 'admin' && <button type="button" className={activeSecurityTab === 'account' ? 'active' : ''} onClick={() => setActiveSecurityTab('account')}>{copy.accountSecurity}</button>}
          <button type="button" className={activeSecurityTab === 'paymentPassword' ? 'active' : ''} onClick={() => setActiveSecurityTab('paymentPassword')}>{copy.paymentSecurity}</button>
          <button type="button" className={activeSecurityTab === 'audit' ? 'active' : ''} onClick={() => setActiveSecurityTab('audit')}>{t('auditLogs')}</button>
        </div>

        {activeSecurityTab === 'general' && (
          <section className="settings-preferences" aria-label={copy.preferences}>
            <div className="settings-preferences-heading">
              <h2>{copy.preferences}</h2>
              <p>{copy.preferencesDescription}</p>
            </div>
            <div className="settings-preference-grid">
              <div className="settings-preference-row">
                <div><strong>{copy.language}</strong><span>{language === 'en' ? copy.english : copy.arabic}</span></div>
                <div className="settings-segmented-control" role="group" aria-label={copy.language}>
                  <button type="button" className={language === 'en' ? 'is-selected' : ''} onClick={() => changeLanguage('en')} aria-pressed={language === 'en'}>{copy.english}</button>
                  <button type="button" className={language === 'ar' ? 'is-selected' : ''} onClick={() => changeLanguage('ar')} aria-pressed={language === 'ar'}>{copy.arabic}</button>
                </div>
              </div>
              <div className="settings-preference-row">
                <div><strong>{copy.appearance}</strong><span>{theme === 'dark' ? copy.dark : copy.light}</span></div>
                <div className="settings-segmented-control" role="group" aria-label={copy.appearance}>
                  <button type="button" className={theme === 'light' ? 'is-selected' : ''} onClick={() => changeTheme('light')} aria-pressed={theme === 'light'}>{copy.light}</button>
                  <button type="button" className={theme === 'dark' ? 'is-selected' : ''} onClick={() => changeTheme('dark')} aria-pressed={theme === 'dark'}>{copy.dark}</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activeSecurityTab === 'account' && user?.role === 'admin' && <AdminAccountSecurity />}
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
                {loadStates.logs?.loading || loadStates.logs?.error ? <tr><td colSpan="5"><DataStatus state={loadStates.logs} /></td></tr> : filteredLogs.length ? filteredLogs.map((log) => (
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
