export const PAYMENT_TIME_ZONE = 'Asia/Amman';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: PAYMENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});

export const getPaymentDayKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getPaymentMonthKey = (value = new Date()) => getPaymentDayKey(value).slice(0, 7);

export const mergePaymentRows = (current, incoming) => [...new Map(
  [...current, ...incoming].map((row) => [String(row._id), row])
).values()];
