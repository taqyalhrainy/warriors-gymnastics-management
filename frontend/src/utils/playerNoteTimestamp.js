export const formatPlayerNoteTimestamp = (value, language, unavailableLabel) => {
  if (!value) return unavailableLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return unavailableLabel;

  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-JO' : 'en-GB', {
    timeZone: 'Asia/Amman',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};
