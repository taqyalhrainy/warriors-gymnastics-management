import { useEffect, useRef, useState } from 'react';
import { createVoiceRecording, prepareChatMedia } from '../utils/chatMedia.js';

const labels = {
  en: { attach: 'Attach photo, video or audio', record: 'Record voice message', stop: 'Finish recording', cancel: 'Cancel recording', remove: 'Remove attachment', preparing: 'Preparing...', recording: 'Recording', microphone: 'Microphone unavailable or permission denied. You can attach an audio file. Android apps without microphone permission need an app update.', size: 'Videos and audio must be smaller than 3 MB. Choose a shorter clip.', format: 'Choose a supported photo, MP4/WebM video or audio file.', read: 'Unable to prepare this file. Try another file.', limit: 'Audio / video: up to 3 MB. Voice recording: up to 2 minutes.' },
  ar: { attach: 'إرفاق صورة أو فيديو أو ملف صوتي', record: 'تسجيل رسالة صوتية', stop: 'إنهاء التسجيل', cancel: 'إلغاء التسجيل', remove: 'إزالة المرفق', preparing: 'جارٍ التحضير...', recording: 'جارٍ التسجيل', microphone: 'الميكروفون غير متاح أو الإذن مرفوض. يمكنك إرفاق ملف صوتي. نسخة أندرويد التي لا تحتوي إذن الميكروفون تحتاج تحديث التطبيق.', size: 'حجم الفيديو أو الصوت يجب أن يكون أقل من 3 ميغابايت. اختر مقطعًا أقصر.', format: 'اختر صورة أو فيديو MP4/WebM أو ملفًا صوتيًا مدعومًا.', read: 'تعذّر تجهيز الملف. جرّب ملفًا آخر.', limit: 'الصوت والفيديو: حتى 3 ميغابايت. التسجيل: حتى دقيقتين.' }
};

function ToolIcon({ microphone = false }) {
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{microphone ? <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></> : <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m3 16 5-5 4 4 3-3 6 6" /></>}</svg>;
}

export default function ChatComposer({ draft, onDraftChange, onSend, sending, language, c }) {
  const t = labels[language] || labels.en;
  const [attachment, setAttachment] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef(null), voiceRef = useRef(null), requestRef = useRef(null), mounted = useRef(true), actionRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const hidden = () => { if (document.hidden) { requestRef.current?.abort(); voiceRef.current?.cancel(); setRecording(false); setBusy(false); actionRef.current = false; } };
    document.addEventListener('visibilitychange', hidden);
    return () => { mounted.current = false; requestRef.current?.abort(); voiceRef.current?.cancel(); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  const prepare = async (file) => {
    setBusy(true); setError(''); setAttachment(null);
    try { const media = await prepareChatMedia(file); if (mounted.current) setAttachment(media); }
    catch (failure) { if (mounted.current) setError(t[failure.message] || t.read); }
    finally { if (mounted.current) setBusy(false); }
  };
  const record = async () => {
    if (actionRef.current) return;
    actionRef.current = true;
    voiceRef.current = null;
    setBusy(true); setError(''); setSeconds(0);
    const request = new AbortController(); requestRef.current = request;
    const current = () => mounted.current && requestRef.current === request && !request.signal.aborted;
    try {
      const voice = await createVoiceRecording({ signal: request.signal, onTime: (time) => { if (current()) setSeconds(time); },
        onComplete: async (blob) => { if (current()) { voiceRef.current = null; actionRef.current = false; setRecording(false); await prepare(blob); } },
        onError: (failure) => { if (current()) { voiceRef.current = null; actionRef.current = false; setRecording(false); setError(t[failure.message] || t.microphone); } }
      });
      if (voice && current()) { voiceRef.current = voice; setRecording(true); }
    } catch { if (current()) setError(t.microphone); }
    finally { if (requestRef.current === request) { if (mounted.current) setBusy(false); if (!voiceRef.current || request.signal.aborted) actionRef.current = false; } }
  };
  const cancel = () => { requestRef.current?.abort(); voiceRef.current?.cancel(); voiceRef.current = null; actionRef.current = false; setRecording(false); };
  const submit = async (event) => {
    event.preventDefault();
    if (busy || recording || sending) return;
    if (await onSend(event, attachment)) setAttachment(null);
  };
  return <div className="chat-composer-area">
    {error && <p role="alert" className="chat-inline-error">{error}</p>}
    {attachment && <div className="chat-attachment-preview">
      {attachment.kind === 'image' ? <img src={attachment.dataUrl} alt={attachment.fileName} /> : attachment.kind === 'video' ? <video src={attachment.dataUrl} controls playsInline preload="metadata" /> : <audio src={attachment.dataUrl} controls preload="metadata" />}
      <button type="button" aria-label={t.remove} disabled={sending} onClick={() => setAttachment(null)}>×</button>
    </div>}
    <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime,audio/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) prepare(file); }} />
    <form className="warriors-chat-composer" onSubmit={submit}>
      {recording ? <div className="chat-recording-controls"><span className="chat-recording-dot" /><span>{t.recording} {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span><button type="button" className="chat-tool-button" onClick={() => voiceRef.current?.stop()} title={t.stop} aria-label={t.stop}>■</button><button type="button" className="chat-tool-button" onClick={cancel} title={t.cancel} aria-label={t.cancel}>×</button></div> : <>
        <button type="button" className="chat-tool-button" aria-label={t.attach} title={`${t.attach} — ${t.limit}`} disabled={busy || sending} onClick={() => fileRef.current?.click()}><ToolIcon /></button>
        <textarea aria-label={c.placeholder} placeholder={busy ? t.preparing : c.placeholder} rows={1} maxLength={2000} value={draft} disabled={sending} onChange={(event) => onDraftChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
        <button type="button" className="chat-tool-button" aria-label={t.record} title={t.record} disabled={busy || sending || Boolean(attachment)} onClick={record}><ToolIcon microphone /></button>
        <button type="submit" disabled={sending || busy || (!draft.trim() && !attachment)} aria-label={sending ? c.sending : c.send}><span className="chat-send-label">{sending ? c.sending : c.send}</span><span aria-hidden="true">➤</span></button>
      </>}
    </form>
  </div>;
}
