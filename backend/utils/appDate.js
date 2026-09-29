const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Amman';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});

const getAppDateKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dateKeyToUtc = (key) => new Date(`${key}T00:00:00.000Z`);
const getAppDateOnly = (value = new Date()) => dateKeyToUtc(getAppDateKey(value));
const getTimeZoneOffset = (value) => {
  const date = new Date(value);
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second));
  return localAsUtc - Math.floor(date.getTime() / 1000) * 1000;
};
const getAppDayStartUtc = (key) => {
  const [year, month, day] = String(key).split('-').map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day);
  let result = targetWallTime;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    result = targetWallTime - getTimeZoneOffset(new Date(result));
  }
  return new Date(result);
};
const getAppDayRangeUtc = (key) => {
  const nextKeyDate = dateKeyToUtc(key);
  nextKeyDate.setUTCDate(nextKeyDate.getUTCDate() + 1);
  return {
    start: getAppDayStartUtc(key),
    end: getAppDayStartUtc(nextKeyDate.toISOString().slice(0, 10))
  };
};

module.exports = { APP_TIME_ZONE, getAppDateKey, dateKeyToUtc, getAppDateOnly, getAppDayStartUtc, getAppDayRangeUtc };
