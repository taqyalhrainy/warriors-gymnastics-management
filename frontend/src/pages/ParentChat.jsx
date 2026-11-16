import ChatWorkspace from '../components/ChatWorkspace.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useEffect, useRef } from 'react';

export default function ParentChat() {
  const { language } = useLanguage();
  const ref = useRef(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      ref.current?.style.setProperty('--chat-viewport-height', `${viewport?.height || window.innerHeight}px`);
      ref.current?.style.setProperty('--chat-viewport-top', `${viewport?.offsetTop || 0}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    viewport?.addEventListener('scroll', resize);
    window.addEventListener('resize', resize);
    return () => { viewport?.removeEventListener('resize', resize); viewport?.removeEventListener('scroll', resize); window.removeEventListener('resize', resize); };
  }, []);
  return <main ref={ref} className="chat-page parent-chat-page" aria-label={language === 'ar' ? 'الشات' : 'Chat'}>
    <ChatWorkspace />
  </main>;
}
