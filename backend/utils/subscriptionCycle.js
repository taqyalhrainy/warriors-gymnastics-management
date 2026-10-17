const { getAppDateKey, getAppDateOnly } = require('./appDate');

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLatestDate = (...values) => values
  .map(toValidDate)
  .filter(Boolean)
  .reduce((latest, date) => (!latest || date > latest ? date : latest), null);

// A linked subscription is a fallback, not authority over an explicit rollback.
const getCurrentSubscriptionStart = (player, fallbackStart = null) => (
  getLatestDate(player?.currentSubscriptionStartedAt, player?.startDate)
  || getLatestDate(player?.subscriptionId?.startDate, fallbackStart)
);

const isPaymentInCurrentSubscription = (payment, player) => {
  const paymentId = String(payment?._id || '');
  const confirmedPaymentId = String(player?.currentSubscriptionPaymentId || '');
  if (paymentId && confirmedPaymentId && paymentId === confirmedPaymentId) return true;

  const paymentSubscriptionId = String(payment?.subscriptionId?._id || payment?.subscriptionId || '');
  const playerSubscriptionId = String(player?.subscriptionId?._id || player?.subscriptionId || '');
  if (paymentSubscriptionId && playerSubscriptionId) {
    return paymentSubscriptionId === playerSubscriptionId;
  }

  const cycleCreatedAt = toValidDate(player?.currentSubscriptionCreatedAt);
  const paymentCreatedAt = toValidDate(payment?.createdAt);
  if (cycleCreatedAt) {
    return Boolean(paymentCreatedAt && (
      paymentCreatedAt >= cycleCreatedAt
      || getAppDateKey(paymentCreatedAt) === getAppDateKey(cycleCreatedAt)
    ));
  }

  const subscriptionStart = getCurrentSubscriptionStart(player);
  if (!subscriptionStart) return true;
  const paymentDate = toValidDate(payment?.paymentDate);
  return Boolean(
    (paymentCreatedAt && paymentCreatedAt >= subscriptionStart)
    || (paymentDate && paymentDate >= subscriptionStart)
  );
};

const isLaterSubscriptionStart = (candidate, player, fallbackStart = null) => {
  const next = toValidDate(candidate);
  const current = getCurrentSubscriptionStart(player, fallbackStart);
  if (!next) return false;
  if (!current) return true;
  return getAppDateOnly(next) > getAppDateOnly(current);
};

module.exports = {
  getCurrentSubscriptionStart,
  getLatestDate,
  isLaterSubscriptionStart,
  isPaymentInCurrentSubscription,
  toValidDate
};
