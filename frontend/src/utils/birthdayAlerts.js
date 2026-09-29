export const birthdayDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);

export const todaysBirthdays = (players, day = birthdayDay()) => players.filter((player) => {
  if (player.isDeleted || player.status === 'left' || !player.dateOfBirth) return false;
  const date = String(player.dateOfBirth).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(5) === day.slice(5) && date <= day;
}).sort((a, b) => a.fullName.localeCompare(b.fullName));

const storageKey = (userId) => `warriors-birthday-read:${userId}`;
export const readBirthdayIds = (userId, day) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
    return saved?.day === day && Array.isArray(saved.ids) ? saved.ids : [];
  } catch { return []; }
};
export const markBirthdaysRead = (userId, day, players) => {
  const ids = [...new Set([...readBirthdayIds(userId, day), ...players.map((player) => String(player._id))])];
  try { localStorage.setItem(storageKey(userId), JSON.stringify({ day, ids })); } catch { /* Storage can be disabled. */ }
  window.dispatchEvent(new Event('birthdays:read'));
  return ids;
};
