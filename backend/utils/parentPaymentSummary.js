// Match the current-subscription Total Paid shown in the admin player profile.
const summarizeParentPayments = (players, payments) => {
  const totals = new Map(players.map((player) => [String(player._id), 0]));
  const byId = new Map(players.map((player) => [String(player._id), player]));
  for (const payment of payments) {
    const id = String(payment.playerId?._id || payment.playerId);
    const player = byId.get(id);
    if (!player) continue;
    if (player.currentSubscriptionStartedAt) {
      if (!payment.createdAt || !(new Date(payment.createdAt) >= new Date(player.currentSubscriptionStartedAt))) continue;
    } else if (player.startDate && !(new Date(payment.paymentDate || 0) >= new Date(player.startDate))) {
      continue;
    }
    totals.set(id, totals.get(id) + Number(payment.paidAmount || 0));
  }
  return totals;
};

module.exports = { summarizeParentPayments };
