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

export const rollPaymentDayForward = ({ previousToday, formDay, selectedDay, preserveFormDay = false }, value = new Date()) => {
  const today = getPaymentDayKey(value);
  return {
    today,
    formDay: !preserveFormDay && formDay === previousToday ? today : formDay,
    selectedDay: selectedDay === previousToday ? today : selectedDay
  };
};

export const mergePaymentRows = (current, incoming) => [...new Map(
  [...current, ...incoming].map((row) => [String(row._id), row])
).values()];

export const mergeConfirmedPaymentRows = (incoming, confirmed, options = {}) => {
  const view = options.view || 'day';
  const search = String(options.search || '').trim();
  if (view === 'pending' || search) return incoming;

  const relevantConfirmed = confirmed.filter((payment) => {
    const day = getPaymentDayKey(payment.paymentDate);
    if (view === 'day') return day === options.day;
    if (view === 'month' || view === 'thisMonth') return day.slice(0, 7) === options.month;
    return view === 'all';
  });

  // The server row wins once it appears, while a just-confirmed receipt stays
  // visible if an older background read finishes after the write.
  return mergePaymentRows(relevantConfirmed, incoming);
};
