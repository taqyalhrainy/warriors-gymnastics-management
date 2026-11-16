import { useEffect, useState } from 'react';
import { saveNotificationResponse } from '../services/notifications.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { Link } from 'react-router-dom';
import { notifyChatChanged } from '../services/chat.js';

const reactions = ['👍', '❤️', '🙏', '😊', '😮', '😢'];

const ParentNotificationResponse = ({ notification, onSaved }) => {
  const { language } = useLanguage();
  const arabic = language === 'ar';
  const [reply, setReply] = useState(notification.response?.reply || '');
  const [reaction, setReaction] = useState(notification.response?.reaction || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setReply(notification.response?.reply || '');
    setReaction(notification.response?.reaction || '');
  }, [notification._id, notification.response]);

  if (notification.response?.deletedAt) return <section className="parent-notification-response"><p>{arabic ? 'تم حذف هذه الرسالة' : 'This message was deleted.'}</p><Link to="/parent/chat">{arabic ? 'متابعة المحادثة في الشات' : 'Continue in Chat'}</Link></section>;
  if (!notification.canRespond) return null;

  const save = async (nextReply, nextReaction) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await saveNotificationResponse(notification._id, {
        reply: nextReply,
        reaction: nextReaction
      });
      setReply(result.response?.reply || '');
      setReaction(result.response?.reaction || '');
      onSaved?.(result.response || null);
      notifyChatChanged();
      setMessage(arabic ? 'تم إرسال ردك للنادي.' : 'Your response was sent to the club.');
    } catch (error) {
      setMessage(error.response?.data?.message || (arabic ? 'تعذر إرسال الرد.' : 'Unable to send your response.'));
    } finally {
      setBusy(false);
    }
  };

  const selectReaction = (value) => {
    const nextReaction = reaction === value ? '' : value;
    setReaction(nextReaction);
    save(reply, nextReaction);
  };

  return (
    <section className="parent-notification-response">
      <h3>{arabic ? 'الرد على الرسالة' : 'Respond to this message'}</h3>
      <div className="notification-reaction-row" aria-label={arabic ? 'اختر رياكشن' : 'Choose a reaction'}>
        {reactions.map((item) => (
          <button
            type="button"
            key={item}
            className={reaction === item ? 'is-selected' : ''}
            onClick={() => selectReaction(item)}
            disabled={busy}
            aria-pressed={reaction === item}
          >{item}</button>
        ))}
      </div>
      <textarea
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        maxLength={2000}
        placeholder={arabic ? 'اكتب ردك هنا...' : 'Write your reply...'}
      />
      <div className="notification-response-actions">
        <small>{reply.length}/2000</small>
        <button type="button" className="btn-primary" disabled={busy || (!reply.trim() && !reaction)} onClick={() => save(reply, reaction)}>
          {busy ? (arabic ? 'جارٍ الإرسال...' : 'Sending...') : (arabic ? 'إرسال الرد' : 'Send reply')}
        </button>
      </div>
      {message && <p className="notification-response-message">{message}</p>}
      <Link to="/parent/chat" className="notification-response-chat-link">{arabic ? 'متابعة المحادثة مع النادي ←' : 'Continue in Chat →'}</Link>
    </section>
  );
};

export default ParentNotificationResponse;
