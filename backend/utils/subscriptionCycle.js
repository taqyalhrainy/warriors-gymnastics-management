const { getAppDateOnly } = require('./appDate');

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getLatestDate = (...values) => values
  .map(toValidDate)
  .filter(Boolean)
  .reduce((latest, date) => (!latest || date > latest ? date : latest), null);

const getCurrentSubscriptionStart = (player, fallbackStart = null) => getLatestDate(
  player?.currentSubscriptionStartedAt,
  player?.startDate,
  player?.subscriptionId?.startDate,
  fallbackStart
);

const isLaterSubscriptionStart = (candidate, player, fallbackStart = null) => {
  const next = toValidDate(candidate);
  const current = getCurrentSubscriptionStart(player, fallbackStart);
  if (!next) return false;
  if (!current) return true;
  return getAppDateOnly(next) > getAppDateOnly(current);
};

module.exports = { getCurrentSubscriptionStart, getLatestDate, isLaterSubscriptionStart, toValidDate };
