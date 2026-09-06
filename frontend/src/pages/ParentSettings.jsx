import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';

const ParentSettingsPage = ({ theme, toggleTheme }) => {
  const navigate = useNavigate();
  const { language, toggleLanguage } = useLanguage();

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
          <button type="button" className="parent-setting-row" onClick={toggleLanguage}>
            <span>Language</span>
            <strong>{language === 'en' ? 'English' : 'Arabic'}</strong>
          </button>
          <button type="button" className="parent-setting-row" onClick={toggleTheme}>
            <span>Mode</span>
            <strong>{theme === 'dark' ? 'Dark' : 'Light'}</strong>
          </button>
        </section>
      </main>
    </div>
  );
};

export default ParentSettingsPage;
