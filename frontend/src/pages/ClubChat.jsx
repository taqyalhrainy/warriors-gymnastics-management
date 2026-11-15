import { useState } from 'react';
import { Link } from 'react-router-dom';
import Sidebar from '../components/Sidebar.jsx';
import ChatWorkspace from '../components/ChatWorkspace.jsx';
import { fetchParentsCompact } from '../services/parents.js';
import { useLanguage } from '../context/LanguageContext.jsx';

export default function ClubChat() {
  const { language } = useLanguage();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadContacts = async () => {
    if (loading || contacts.length) return;
    setLoading(true);
    try { setContacts(await fetchParentsCompact()); setError(''); }
    catch { setError(language === 'ar' ? 'تعذر تحميل الأهالي.' : 'Unable to load parents.'); }
    finally { setLoading(false); }
  };
  return <div className="dashboard-layout"><Sidebar /><main className="page-content chat-page">
    <header className="chat-page-heading"><div><span>WARRIORS GYMNASTICS</span><h1>{language === 'ar' ? 'الشات' : 'Chat'}</h1></div><Link className="btn-secondary" to="/notifications">{language === 'ar' ? 'الإشعارات' : 'Notifications'}</Link></header>
    <ChatWorkspace contacts={contacts} contactsLoading={loading} contactsError={error} onRequestContacts={loadContacts} />
  </main></div>;
}
