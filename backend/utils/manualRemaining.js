const { getCurrentSubscriptionStart } = require('./subscriptionCycle');

const getRemainingAmount = (player) => Math.max(0,
  Number(player?.preservedRemainingBalance || 0)
  + (player?.attendanceDueManual ? Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0) : 0)
);

// Only the one-time cutover may calculate a balance from prices/payments.
// Afterwards it is a fixed carried balance, replaced only by a manual amount.
const preserveLegacyRemainingBalances = async () => {
  const Player = require('../models/Player');
  const Payment = require('../models/Payment');
  let preserved = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const players = await Player.collection.find({ remainingBalancePolicyVersion: { $exists: false } }).toArray();
    if (!players.length) return preserved;
    const payments = await Payment.find({ playerId: { $in: players.map((player) => player._id) },
      transactionType: { $in: ['Full payment', 'Partial payment'] }
    }).select('playerId paidAmount paymentDate createdAt').lean();
    const byPlayer = new Map(players.map((player) => [String(player._id), { player,
      start: getCurrentSubscriptionStart(player), paid: 0 }]));
    for (const payment of payments) {
      const row = byPlayer.get(String(payment.playerId));
      if (!row.start || new Date(payment.createdAt || 0) >= row.start || new Date(payment.paymentDate || 0) >= row.start) {
        row.paid += Number(payment.paidAmount || 0);
      }
    }
    for (const { player, paid } of byPlayer.values()) {
      const filter = { _id: player._id, remainingBalancePolicyVersion: { $exists: false } };
      for (const key of ['__v', 'payment', 'startDate', 'currentSubscriptionStartedAt', 'previousDueBalance', 'dueAdjustment', 'attendanceDueManual']) {
        filter[key] = player[key] === undefined ? { $exists: false } : player[key];
      }
      const result = await Player.collection.updateOne(filter, { $set: {
        preservedRemainingBalance: Math.max(0, Number(player.payment || 0) - paid),
        remainingBalancePolicyVersion: 1,
        remainingBalancePreservedAt: new Date()
      }, $inc: { __v: 1 } });
      preserved += result.modifiedCount;
    }
  }
  if (!await Player.collection.countDocuments({ remainingBalancePolicyVersion: { $exists: false } })) return preserved;
  throw new Error('Balance cutover could not finish safely. Retry before accepting requests.');
};

module.exports = { getRemainingAmount, preserveLegacyRemainingBalances };
