import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { fetchChatConversations, getCachedChatConversations, mergeChatConversations, fetchChatMessages, getCachedChatMessages, markChatRead, sendChatMessage } from '../services/chat.js';
import warriorsLogo from '../assets/warriors-logo.png';
import ChatComposer from './ChatComposer.jsx';
import ChatMedia from './ChatMedia.jsx';
import './chat.css';

const copy = {
  en: { chat: 'Chat', messages: 'Messages', club: 'Warriors Gymnastics', clubLabel: 'Club team', search: 'Search conversations', newChat: 'New message', choose: 'Choose a parent', empty: 'Your conversations start here', emptyHint: 'Choose a conversation or start a new one.', parentEmpty: 'Say hello to your club', parentHint: 'Send a message to the Warriors team.', placeholder: 'Message...', send: 'Send', sending: 'Sending...', older: 'Load earlier messages', all: 'All days', day: 'Filter by day', reply: 'Replied to a notification', original: 'View original notification', unavailable: 'Original notification unavailable', error: 'Unable to load messages. Try again.', retry: 'Retry', failed: 'Message could not be sent. Your text is saved here. Try again.', loading: 'Loading...', seen: 'Seen', sent: 'Sent', noDay: 'No messages on this day.', back: 'Back to conversations', you: 'You', reaction: 'Reaction', noResults: 'No conversations found' },
  ar: { chat: 'الشات', messages: 'المحادثات', club: 'Warriors Gymnastics', clubLabel: 'فريق النادي', search: 'ابحث بالمحادثات', newChat: 'رسالة جديدة', choose: 'اختر ولي أمر', empty: 'محادثاتك تبدأ من هون', emptyHint: 'اختر محادثة أو ابدأ رسالة جديدة.', parentEmpty: 'تواصل مع النادي', parentHint: 'ابعث رسالتك لفريق Warriors.', placeholder: 'اكتب رسالة...', send: 'إرسال', sending: 'جارٍ الإرسال...', older: 'عرض الرسائل السابقة', all: 'كل الأيام', day: 'تصفية حسب اليوم', reply: 'رد على إشعار', original: 'عرض الإشعار الأصلي', unavailable: 'الإشعار الأصلي غير متاح', error: 'تعذر تحميل المحادثات. حاول مجددًا.', retry: 'إعادة المحاولة', failed: 'تعذر إرسال الرسالة. النص محفوظ هون، حاول مجددًا.', loading: 'جارٍ التحميل...', seen: 'تمت القراءة', sent: 'تم الإرسال', noDay: 'لا توجد رسائل في هذا اليوم.', back: 'رجوع للمحادثات', you: 'أنت', reaction: 'رياكشن', noResults: 'لا توجد محادثات مطابقة' }
};
const formatTime = (value, language) => new Date(value).toLocaleTimeString(language === 'ar' ? 'ar-JO' : 'en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Amman' });
const dayKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Amman' });
const formatDay = (value, language) => new Date(value).toLocaleDateString(language === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Amman' });
const mergeMessages = (current, incoming) => [...new Map([...current, ...incoming].map((item) => [item.key, item])).values()]
  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || String(a._id).localeCompare(String(b._id)));

function ChatThread({ parentId, name, parentMode, language, c, onBack, draftStore }) {
  const cachedThread = getCachedChatMessages(parentId);
  const [items, setItems] = useState(() => cachedThread?.items || []);
  const [cursor, setCursor] = useState(() => cachedThread?.cursor || null);
  const [date, setDate] = useState('');
  const [draft, setDraft] = useState(() => draftStore.current[parentId] || '');
  const [loading, setLoading] = useState(() => !cachedThread);
  const [parentName, setParentName] = useState(() => cachedThread?.parent.name || name);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);
  const mountedRef = useRef(true);
  const sendingRef = useRef(false);
  const sendIdRef = useRef(null);
  const sendPayloadRef = useRef(null);
  const writeVersionRef = useRef(0);
  const fetchVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestVersion = ++fetchVersionRef.current;
    let busy = false;
    let first = true;
    const cached = getCachedChatMessages(parentId, date ? { date } : {});
    pinnedRef.current = true;
    setItems(cached?.items || []);
    setCursor(cached?.cursor || null);
    setLoading(!cached);
    setError('');
    const refresh = async (force = false) => {
      if (busy || controller.signal.aborted || document.hidden) return;
      busy = true;
      const writeVersion = writeVersionRef.current;
      try {
        const data = await fetchChatMessages(parentId, date ? { date } : {}, { force });
        if (controller.signal.aborted || writeVersion !== writeVersionRef.current) return;
        setParentName(data.parent.name);
        setItems((current) => {
          const cutoff = data.hasMore ? new Date(data.items[0]?.createdAt).getTime() : -Infinity;
          const older = current.filter((item) => new Date(item.createdAt).getTime() < cutoff);
          return mergeMessages(older, data.items);
        });
        if (first) setCursor(data.cursor);
        setError('');
        if (!document.hidden) {
          const unread = data.items.filter((item) => !item.readAt && item.fromClub === parentMode);
          await markChatRead(parentId, unread);
        }
        first = false;
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.response?.data?.message || c.error);
      } finally {
        busy = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    refresh(reload > 0);
    const refreshLatest = () => refresh(true);
    const timer = window.setInterval(refreshLatest, 4000);
    window.addEventListener('chat:refresh', refreshLatest);
    document.addEventListener('visibilitychange', refreshLatest);
    return () => {
      controller.abort();
      if (fetchVersionRef.current === requestVersion) fetchVersionRef.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('chat:refresh', refreshLatest);
      document.removeEventListener('visibilitychange', refreshLatest);
    };
  }, [parentId, date, reload, parentMode, c.error]);

  useEffect(() => {
    if (pinnedRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items, loading]);

  const loadOlder = async () => {
    if (!cursor || olderLoading) return;
    setOlderLoading(true);
    pinnedRef.current = false;
    const version = fetchVersionRef.current;
    const previousHeight = scrollRef.current?.scrollHeight || 0;
    try {
      const data = await fetchChatMessages(parentId, { ...cursor, ...(date ? { date } : {}) });
      if (!mountedRef.current || version !== fetchVersionRef.current) return;
      setItems((current) => mergeMessages(data.items, current));
      setCursor(data.cursor);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - previousHeight;
      });
    } catch (failure) {
      if (mountedRef.current && version === fetchVersionRef.current) setError(failure.response?.data?.message || c.error);
    } finally { if (mountedRef.current) setOlderLoading(false); }
  };

  const send = async (event, attachment) => {
    event.preventDefault();
    const text = draft.trim();
    if ((!text && !attachment) || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setError('');
    if (!sendIdRef.current || sendPayloadRef.current?.text !== text || sendPayloadRef.current?.attachment !== attachment) {
      sendIdRef.current = crypto.randomUUID();
      sendPayloadRef.current = { text, attachment };
    }
    try {
      const saved = await sendChatMessage(parentId, text, sendIdRef.current, attachment);
      if (!mountedRef.current) return false;
      writeVersionRef.current += 1;
      pinnedRef.current = true;
      setDate('');
      setItems((current) => mergeMessages(current, [saved]));
      setDraft('');
      draftStore.current[parentId] = '';
      sendIdRef.current = null;
      sendPayloadRef.current = null;
      return true;
    } catch (failure) {
      if (mountedRef.current) setError(failure.response?.data?.message || c.failed);
      return false;
    } finally {
      sendingRef.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  return (
    <section className="warriors-chat-thread" aria-label={parentMode ? c.club : name}>
      <header className="warriors-chat-thread-header">
        {parentMode && <Link to="/parent" className="chat-page-back" aria-label={language === 'ar' ? 'الصفحة الرئيسية' : 'Home'}>‹</Link>}
        {!parentMode && <button type="button" className="chat-mobile-back" onClick={onBack} aria-label={c.back}>‹</button>}
        <span className={`chat-avatar${parentMode ? ' is-club' : ''}`}>{parentMode ? <img src={warriorsLogo} alt="" /> : parentName?.charAt(0)}</span>
        <div><h2>{parentMode ? c.club : parentName}</h2><span>{parentMode ? c.clubLabel : c.messages}</span></div>
        <span className="chat-header-mark" aria-hidden="true">✦</span>
      </header>
      <div className="warriors-chat-filter">
        <span>{c.messages}</span>
        <label><span>{c.day}</span><input aria-label={c.day} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {date && <button type="button" onClick={() => setDate('')}>{c.all}</button>}
      </div>
      <div className="warriors-chat-scroll" ref={scrollRef} role="log" aria-label={c.messages} onScroll={() => {
        const box = scrollRef.current;
        if (box) pinnedRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
      }}>
        {cursor && <button type="button" className="chat-load-older" disabled={olderLoading} onClick={loadOlder}>{olderLoading ? c.loading : c.older}</button>}
        {loading && <p className="chat-empty-line">{c.loading}</p>}
        {!loading && !items.length && <div className="chat-thread-welcome"><img src={warriorsLogo} alt="" /><h3>{date ? c.noDay : c.parentEmpty}</h3>{!date && <p>{c.parentHint}</p>}</div>}
        {items.map((item, index) => {
          const mine = parentMode ? !item.fromClub : item.fromClub;
          const original = item.originalNotification;
          return <div className="chat-timeline-item" key={item.key}>
            {(!index || dayKey(items[index - 1].createdAt) !== dayKey(item.createdAt)) && <div className="chat-day-divider"><span>{formatDay(item.createdAt, language)}</span></div>}
            <article className={`chat-message${mine ? ' is-mine' : ''}${item.kind === 'notification-response' ? ' is-notification-reply' : ''}`}>
              {item.kind === 'notification-response' && <div className="chat-reply-context">
                <span>↩ {c.reply}</span>
                {original ? <Link to={`${parentMode ? '/parent' : ''}/notifications/${original._id}`}><strong>{original.title}</strong><p>{original.message}</p><small>{c.original} ↗</small></Link> : <small>{c.unavailable}</small>}
              </div>}
              <div className="chat-bubble">{item.reaction && <span className="chat-inline-reaction" aria-label={c.reaction}>{item.reaction}</span>}{item.attachment?.kind && <ChatMedia parentId={parentId} item={item} language={language} />}{item.text && <p dir="auto">{item.text}</p>}</div>
              <div className="chat-message-meta"><time dateTime={item.createdAt}>{formatTime(item.createdAt, language)}</time>{mine && item.kind === 'message' && <span>{item.readAt ? c.seen : c.sent}</span>}</div>
            </article>
          </div>;
        })}
      </div>
      {error && <div className="chat-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => setReload((value) => value + 1)}>{c.retry}</button></div>}
      <ChatComposer draft={draft} sending={sending} language={language} c={c} onSend={send} onDraftChange={(value) => {
          setDraft(value);
          draftStore.current[parentId] = value;
          sendIdRef.current = null;
        }} />
    </section>
  );
}

export default function ChatWorkspace({ contacts = [], contactsLoading = false, contactsError = '', onRequestContacts }) {
  const { user } = useAuth();
  const { language } = useLanguage();
  const c = copy[language] || copy.en;
  const parentMode = user?.role === 'parent';
  const userId = user?.id || user?._id;
  const [params, setParams] = useSearchParams();
  const selectedId = parentMode ? userId : params.get('parent') || '';
  const cachedInbox = parentMode ? null : getCachedChatConversations();
  const [conversations, setConversations] = useState(() => cachedInbox?.items || []);
  const [cursor, setCursor] = useState(() => cachedInbox?.cursor || null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [inboxSearch, setInboxSearch] = useState('');
  const [newChat, setNewChat] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(() => !cachedInbox);
  const [refresh, setRefresh] = useState(0);
  const draftStore = useRef({});
  const inboxRequestRef = useRef(0);
  const expandedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const select = useCallback((id) => { setParams(id ? { parent: id } : {}); setNewChat(false); }, [setParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setInboxSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (parentMode) return undefined;
    const controller = new AbortController();
    const version = ++inboxRequestRef.current;
    const cached = getCachedChatConversations({ search: inboxSearch });
    expandedRef.current = false;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setConversations(cached?.items || []);
    setCursor(cached?.cursor || null);
    setLoading(!cached);
    let busy = false;
    const load = async (force = false) => {
      if (busy || document.hidden || controller.signal.aborted) return;
      busy = true;
      try {
        const data = await fetchChatConversations({ search: inboxSearch }, { force });
        if (!controller.signal.aborted) {
          setConversations((current) => expandedRef.current ? mergeChatConversations(current, data.items) : data.items);
          if (!expandedRef.current) setCursor(data.cursor);
          setError('');
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.response?.data?.message || c.error);
      } finally { busy = false; if (!controller.signal.aborted) setLoading(false); }
    };
    load(refresh > 0);
    const reloadInbox = () => load(true);
    const timer = window.setInterval(reloadInbox, 15000);
    window.addEventListener('chat:changed', reloadInbox);
    document.addEventListener('visibilitychange', reloadInbox);
    return () => {
      controller.abort();
      if (inboxRequestRef.current === version) inboxRequestRef.current += 1;
      window.clearInterval(timer);
      window.removeEventListener('chat:changed', reloadInbox);
      document.removeEventListener('visibilitychange', reloadInbox);
    };
  }, [parentMode, userId, inboxSearch, refresh, c.error]);

  const loadMoreConversations = async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const version = inboxRequestRef.current;
    try {
      const data = await fetchChatConversations({ search: inboxSearch, ...cursor });
      if (version !== inboxRequestRef.current) return;
      expandedRef.current = true;
      setConversations((current) => mergeChatConversations(current, data.items));
      setCursor(data.cursor);
      setError('');
    } catch (failure) {
      if (version === inboxRequestRef.current) setError(failure.response?.data?.message || c.error);
    } finally {
      if (version === inboxRequestRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  const contactById = new Map(contacts.filter((parent) => parent.userId?._id).map((parent) => [parent.userId._id, { _id: parent.userId._id, name: parent.name }]));
  const selected = conversations.find((item) => item._id === selectedId) || contactById.get(selectedId);
  const visible = newChat
    ? [...contactById.values()].filter((item) => item.name?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    : conversations;
  return <div className={`warriors-chat${parentMode ? ' is-parent' : ''}${selectedId ? ' has-thread' : ''}`} dir={language === 'ar' ? 'rtl' : 'ltr'}>
    {!parentMode && <aside className="warriors-chat-inbox">
      <header><div><span className="chat-eyebrow">WARRIORS</span><h2>{c.messages}</h2></div><button type="button" className="chat-new-button" aria-label={c.newChat} title={c.newChat} onClick={() => { setNewChat((value) => !value); onRequestContacts?.(); }}>＋</button></header>
      <div className="chat-search"><span aria-hidden="true">⌕</span><input type="search" aria-label={c.search} placeholder={newChat ? c.choose : c.search} value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {error && <div className="chat-inline-error" role="alert">{error}<button onClick={() => setRefresh((value) => value + 1)}>{c.retry}</button></div>}
      {newChat && contactsError && <p role="alert" className="chat-empty-line">{contactsError}</p>}
      <div className="chat-conversation-list">
        {(newChat ? contactsLoading : loading) && <p className="chat-empty-line">{c.loading}</p>}
        {visible.map((item) => <button type="button" key={item._id} className={`chat-conversation${item._id === selectedId ? ' is-active' : ''}`} onClick={() => select(item._id)}>
          <span className="chat-avatar">{item.name?.charAt(0)}</span>
          <span className="chat-conversation-copy"><strong>{item.name}</strong><span>{item.lastMessage?.reaction} {item.lastMessage?.fromClub ? `${c.you} · ` : ''}{item.lastMessage?.text || (item.lastMessage?.attachment?.kind ? ({ image: language === 'ar' ? 'صورة' : 'Photo', audio: language === 'ar' ? 'رسالة صوتية' : 'Voice message', video: language === 'ar' ? 'فيديو' : 'Video' }[item.lastMessage.attachment.kind]) : c.newChat)}</span></span>
          <span className="chat-conversation-end">{item.lastMessage && <time>{formatTime(item.lastMessage.createdAt, language)}</time>}{item.unreadCount > 0 && <b>{item.unreadCount}</b>}</span>
        </button>)}
        {!loading && !visible.length && <p className="chat-empty-line">{c.noResults}</p>}
        {!newChat && cursor && <button type="button" className="chat-load-older" disabled={loadingMore} onClick={loadMoreConversations}>{loadingMore ? c.loading : (language === 'ar' ? 'عرض المزيد' : 'View more')}</button>}
      </div>
      <footer><img src={warriorsLogo} alt="" /><span>Warriors Gymnastics</span></footer>
    </aside>}
    {selectedId ? <ChatThread key={`${userId}-${selectedId}`} parentId={selectedId} name={selected?.name || c.messages} parentMode={parentMode} language={language} c={c} onBack={() => select('')} draftStore={draftStore} /> : <section className="chat-no-conversation"><div className="chat-empty-symbol" aria-hidden="true">✉</div><h2>{c.empty}</h2><p>{c.emptyHint}</p><button type="button" onClick={() => { setNewChat(true); onRequestContacts?.(); }}>{c.newChat}</button></section>}
  </div>;
}
