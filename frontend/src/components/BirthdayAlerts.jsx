import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useBirthdayAlerts } from '../hooks/useBirthdayAlerts.js';
import { markBirthdaysRead } from '../utils/birthdayAlerts.js';

export const BirthdayBadge = () => {
  const { unread } = useBirthdayAlerts();
  const { language } = useLanguage();
  const label = language === 'ar' ? 'أعياد ميلاد اليوم' : "Today's birthdays";
  return unread > 0 ? <span className="birthday-badge" title={`${label}: ${unread}`} aria-label={`${label}: ${unread}`}>{'\u{1F389}'}</span> : null;
};

export default function BirthdayAlerts() {
  const { birthdays, day, userId, unread, ready, error } = useBirthdayAlerts();
  const { language, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const title = language === 'ar' ? 'أعياد ميلاد اليوم' : "Today's Birthdays";
  const ids = birthdays.map((player) => String(player._id)).join(',');
  useEffect(() => {
    if (open && ready && !error && unread) markBirthdaysRead(userId, day, birthdays);
  }, [open, ready, error, unread, userId, day, ids]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <>
    <button className="birthday-alert-button" type="button" onClick={() => setOpen(true)}>
      <span>{title}</span>{unread > 0 && <span aria-label={title}>{'\u{1F389}'}</span>}
    </button>
    {open && <div className="student-modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="student-modal birthday-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="student-modal-header"><h2>{'\u{1F389}'} {title}</h2><button autoFocus className="btn-secondary" type="button" onClick={() => setOpen(false)}>{t('close')}</button></div>
        {error ? <p role="alert">{language === 'ar' ? 'تعذّر تحميل أعياد الميلاد' : error}</p>
          : !ready ? <p role="status">{language === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}</p>
          : birthdays.length ? <ul className="birthday-player-list">{birthdays.map((player) => <li key={player._id}>
            <Link to={`/players/${player._id}`}>{player.fullName}</Link>
            <span>{Number(day.slice(0, 4)) - Number(player.dateOfBirth.slice(0, 4))} {language === 'ar' ? 'سنة' : 'years'}</span>
          </li>)}</ul> : <p>{language === 'ar' ? 'لا يوجد أعياد ميلاد اليوم' : 'No birthdays today'}</p>}
      </section>
    </div>}
  </>;
}
