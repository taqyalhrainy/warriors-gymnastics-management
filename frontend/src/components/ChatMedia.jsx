import { useEffect, useRef, useState } from 'react';
import { fetchChatAttachment } from '../services/chat.js';

export default function ChatMedia({ parentId, item, language }) {
  const [url, setUrl] = useState(''), [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const ref = useRef(null), busy = useRef(false), objectUrl = useRef(''), controller = useRef(null);
  const media = item.attachment;
  const arabic = language === 'ar';
  const load = async () => {
    if (busy.current || objectUrl.current) return;
    busy.current = true; setLoading(true); setError(false);
    const request = new AbortController(); controller.current = request;
    try {
      const blob = await fetchChatAttachment(parentId, item._id, request.signal);
      if (!request.signal.aborted) { objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current); }
    } catch { if (!request.signal.aborted) setError(true); }
    finally { busy.current = false; if (!request.signal.aborted) setLoading(false); }
  };
  useEffect(() => {
    let observer;
    if (media.kind === 'image' && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load(); } });
      if (ref.current) observer.observe(ref.current);
    }
    return () => { observer?.disconnect(); controller.current?.abort(); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ''; };
  }, [parentId, item._id]);
  const label = media.kind === 'audio' ? (arabic ? 'رسالة صوتية' : 'Voice message') : media.kind === 'video' ? (arabic ? 'فيديو' : 'Video') : (arabic ? 'صورة' : 'Photo');
  return <div className={`chat-media chat-media-${media.kind}`} ref={ref}>
    {url ? media.kind === 'image' ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={media.fileName || label} onLoad={(event) => { const scroll = event.currentTarget.closest('.warriors-chat-scroll'); if (scroll && scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 400) scroll.scrollTop = scroll.scrollHeight; }} /></a> : media.kind === 'video' ? <video src={url} controls playsInline preload="metadata" /> : <audio src={url} controls preload="metadata" /> : <button type="button" disabled={loading} onClick={load}>{loading ? (arabic ? 'جارٍ التحميل...' : 'Loading...') : error ? (arabic ? 'إعادة المحاولة' : 'Retry') : `${media.kind === 'audio' ? '▶' : '▣'} ${label}`}</button>}
  </div>;
}
