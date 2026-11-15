import Sidebar from '../components/Sidebar.jsx';
import ChatWorkspace from '../components/ChatWorkspace.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Link } from 'react-router-dom';

export default function ParentChat() {
  const { language } = useLanguage();
  return <div className="dashboard-layout parent-app-layout"><Sidebar /><main className="page-content parent-portal-page chat-page parent-chat-page">
    <header className="chat-page-heading"><Link to="/parent" className="chat-page-back" aria-label={language === 'ar' ? 'الصفحة الرئيسية' : 'Home'}>‹</Link><div><span>WARRIORS GYMNASTICS</span><h1>{language === 'ar' ? 'الشات' : 'Chat'}</h1></div></header>
    <ChatWorkspace />
  </main></div>;
}
