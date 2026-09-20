import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import PushNotificationSettings from '../components/PushNotificationSettings.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentSettingsPage = ({ theme, toggleTheme }) => {
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();
  const { logout } = useAuth();
  const [openPanel, setOpenPanel] = useState('');
  const isArabic = language === 'ar';
  const copy = isArabic ? {
    parentApp: 'تطبيق ولي الأمر',
    settings: 'الإعدادات',
    language: 'اللغة',
    english: 'الإنجليزية',
    arabic: 'العربية',
    selected: 'محدد',
    choose: 'اختيار',
    mode: 'الوضع',
    dark: 'داكن',
    light: 'فاتح',
    notifications: 'الإشعارات',
    phoneAlerts: 'تنبيهات الهاتف',
    account: 'الحساب',
    logout: 'تسجيل الخروج',
    session: 'الجلسة'
  } : {
    parentApp: 'Parent app',
    settings: 'Settings',
    language: 'Language',
    english: 'English',
    arabic: 'Arabic',
    selected: 'Selected',
    choose: 'Choose',
    mode: 'Mode',
    dark: 'Dark',
    light: 'Light',
    notifications: 'Notifications',
    phoneAlerts: 'Phone alerts',
    account: 'Account',
    logout: 'Logout',
    session: 'Session'
  };

  const togglePanel = (panel) => {
    setOpenPanel((current) => (current === panel ? '' : panel));
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="dashboard-layout parent-app-layout">
      <Sidebar />
      <main className="page-content parent-portal-page parent-settings-page">
        <button type="button" className="parent-back-button" onClick={() => navigate('/parent')} aria-label="Back to parent home">
          <span aria-hidden="true">&lsaquo;</span>
        </button>

        <section className="parent-hero is-compact parent-settings-hero">
          <div>
            <span className="parent-kicker">{copy.parentApp}</span>
            <h1>{copy.settings}</h1>
          </div>
        </section>

        <section className="parent-settings-page-card">
          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('language')}>
              <span>{copy.language}</span>
              <strong>{language === 'en' ? copy.english : copy.arabic}</strong>
              <i className={openPanel === 'language' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'language' && (
              <div className="parent-setting-panel">
                <button type="button" className={`parent-setting-choice ${language === 'en' ? 'is-selected' : ''}`} onClick={() => language !== 'en' && toggleLanguage()}>
                  <span>{copy.english}</span>
                  <strong>{language === 'en' ? copy.selected : copy.choose}</strong>
                </button>
                <button type="button" className={`parent-setting-choice ${language === 'ar' ? 'is-selected' : ''}`} onClick={() => language !== 'ar' && toggleLanguage()}>
                  <span>{copy.arabic}</span>
                  <strong>{language === 'ar' ? copy.selected : copy.choose}</strong>
                </button>
              </div>
            )}
          </div>

          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('mode')}>
              <span>{copy.mode}</span>
              <strong>{theme === 'dark' ? copy.dark : copy.light}</strong>
              <i className={openPanel === 'mode' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'mode' && (
              <div className="parent-setting-panel">
                <button type="button" className={`parent-setting-choice ${theme === 'light' ? 'is-selected' : ''}`} onClick={() => theme !== 'light' && toggleTheme()}>
                  <span>{copy.light}</span>
                  <strong>{theme === 'light' ? copy.selected : copy.choose}</strong>
                </button>
                <button type="button" className={`parent-setting-choice ${theme === 'dark' ? 'is-selected' : ''}`} onClick={() => theme !== 'dark' && toggleTheme()}>
                  <span>{copy.dark}</span>
                  <strong>{theme === 'dark' ? copy.selected : copy.choose}</strong>
                </button>
              </div>
            )}
          </div>

          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('notifications')}>
              <span>{copy.notifications}</span>
              <strong>{copy.phoneAlerts}</strong>
              <i className={openPanel === 'notifications' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'notifications' && <PushNotificationSettings />}
          </div>

          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('account')}>
              <span>{copy.account}</span>
              <strong>{copy.logout}</strong>
              <i className={openPanel === 'account' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'account' && (
              <div className="parent-setting-panel">
                <button type="button" className="parent-setting-choice is-danger" onClick={handleLogout}>
                  <span>{copy.session}</span>
                  <strong>{copy.logout}</strong>
                </button>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ParentSettingsPage;
