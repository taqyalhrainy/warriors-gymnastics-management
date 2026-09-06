import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentSettingsPage = ({ theme, toggleTheme }) => {
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();
  const { logout } = useAuth();
  const [openPanel, setOpenPanel] = useState('');

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
            <span className="parent-kicker">Parent app</span>
            <h1>Settings</h1>
          </div>
        </section>

        <section className="parent-settings-page-card">
          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('language')}>
              <span>Language</span>
              <strong>{language === 'en' ? 'English' : 'Arabic'}</strong>
              <i className={openPanel === 'language' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'language' && (
              <div className="parent-setting-panel">
                <button type="button" className={`parent-setting-choice ${language === 'en' ? 'is-selected' : ''}`} onClick={() => language !== 'en' && toggleLanguage()}>
                  <span>English</span>
                  <strong>{language === 'en' ? 'Selected' : 'Choose'}</strong>
                </button>
                <button type="button" className={`parent-setting-choice ${language === 'ar' ? 'is-selected' : ''}`} onClick={() => language !== 'ar' && toggleLanguage()}>
                  <span>Arabic</span>
                  <strong>{language === 'ar' ? 'Selected' : 'Choose'}</strong>
                </button>
              </div>
            )}
          </div>

          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('mode')}>
              <span>Mode</span>
              <strong>{theme === 'dark' ? 'Dark' : 'Light'}</strong>
              <i className={openPanel === 'mode' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'mode' && (
              <div className="parent-setting-panel">
                <button type="button" className={`parent-setting-choice ${theme === 'light' ? 'is-selected' : ''}`} onClick={() => theme !== 'light' && toggleTheme()}>
                  <span>Light</span>
                  <strong>{theme === 'light' ? 'Selected' : 'Choose'}</strong>
                </button>
                <button type="button" className={`parent-setting-choice ${theme === 'dark' ? 'is-selected' : ''}`} onClick={() => theme !== 'dark' && toggleTheme()}>
                  <span>Dark</span>
                  <strong>{theme === 'dark' ? 'Selected' : 'Choose'}</strong>
                </button>
              </div>
            )}
          </div>

          <div className="parent-setting-group">
            <button type="button" className="parent-setting-header" onClick={() => togglePanel('account')}>
              <span>Account</span>
              <strong>Logout</strong>
              <i className={openPanel === 'account' ? 'is-open' : ''} aria-hidden="true" />
            </button>
            {openPanel === 'account' && (
              <div className="parent-setting-panel">
                <button type="button" className="parent-setting-choice is-danger" onClick={handleLogout}>
                  <span>Session</span>
                  <strong>Logout</strong>
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
