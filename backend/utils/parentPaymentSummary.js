// Match the current-subscription Total Paid shown in the admin player profile.
const { getCurrentSubscriptionStart } = require('./subscriptionCycle');
const summarizeParentPayments = (players, payments) => {
  const totals = new Map(players.map((player) => [String(player._id), 0]));
  const byId = new Map(players.map((player) => [String(player._id), player]));
  for (const payment of payments) {
    const id = String(payment.playerId?._id || payment.playerId);
    const player = byId.get(id);
    if (!player) continue;
    const start = getCurrentSubscriptionStart(player);
    if (start && !(new Date(payment.createdAt || 0) >= start || new Date(payment.paymentDate || 0) >= start)) continue;
    totals.set(id, totals.get(id) + Number(payment.paidAmount || 0));
  }
  return totals;
};

module.exports = { summarizeParentPayments };
