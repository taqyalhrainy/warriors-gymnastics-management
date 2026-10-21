export const birthdayDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Amman', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);

export const todaysBirthdays = (players, day = birthdayDay()) => players.filter((player) => {
  if (player.isDeleted || player.status === 'left' || !player.dateOfBirth) return false;
  const date = String(player.dateOfBirth).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date.slice(5) === day.slice(5) && date <= day;
}).sort((a, b) => a.fullName.localeCompare(b.fullName));

const addBirthdayDays = (day, offset) => {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) return '';
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
};

export const birthdayAlertDay = (player, day = birthdayDay(), daysAhead = 2) => {
  if (player?.isDeleted || player?.status === 'left' || !player?.dateOfBirth) return '';
  const date = String(player.dateOfBirth).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const candidate = addBirthdayDays(day, offset);
    if (candidate && date.slice(5) === candidate.slice(5) && date <= candidate) return candidate;
  }
  return '';
};

export const upcomingBirthdays = (players, day = birthdayDay(), daysAhead = 2) => players
  .filter((player) => birthdayAlertDay(player, day, daysAhead))
  .sort((first, second) => {
    const dateOrder = birthdayAlertDay(first, day, daysAhead).localeCompare(birthdayAlertDay(second, day, daysAhead));
    return dateOrder || first.fullName.localeCompare(second.fullName);
  });

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
