const HistoryEntry = require('../models/HistoryEntry');
const Payment = require('../models/Payment');
const Player = require('../models/Player');
const { getAppDateKey } = require('./appDate');

const SUBSCRIPTION_PAYMENT_TYPES = ['Full payment', 'Partial payment'];

const beginSubscriptionPaymentProof = (player, createdAt = new Date()) => {
  player.currentSubscriptionCreatedAt = createdAt;
  player.currentSubscriptionPaymentConfirmedAt = null;
  player.currentSubscriptionPaymentId = null;
};

const paymentMatchesCycleDay = (cycleCreatedAt, paymentRecordedAt) => {
  const cycleTime = new Date(cycleCreatedAt || 0).getTime();
  const paymentTime = new Date(paymentRecordedAt || 0).getTime();
  return cycleTime > 0
    && paymentTime >= cycleTime
    && getAppDateKey(cycleTime) === getAppDateKey(paymentTime);
};

const confirmSubscriptionPaymentProof = async (player, payment, recordedAt = payment?.createdAt || new Date()) => {
  if (!player?._id || !player.currentSubscriptionCreatedAt || !payment?._id) return false;
  if (!SUBSCRIPTION_PAYMENT_TYPES.includes(payment.transactionType) || Number(payment.paidAmount || 0) <= 0) return false;
  if (!paymentMatchesCycleDay(player.currentSubscriptionCreatedAt, recordedAt)) return false;

  const result = await Player.updateOne({
    _id: player._id,
    currentSubscriptionCreatedAt: player.currentSubscriptionCreatedAt,
    currentSubscriptionPaymentConfirmedAt: null
  }, {
    $set: {
      currentSubscriptionPaymentConfirmedAt: recordedAt,
      currentSubscriptionPaymentId: payment._id
    }
  });
  return result.modifiedCount > 0;
};

const findCycleHistoryEntry = (player, entries) => {
  const currentStartKey = getAppDateKey(player.currentSubscriptionStartedAt || player.startDate);
  return entries.find((entry) => {
    if (!entry.after || getAppDateKey(entry.after.currentSubscriptionStartedAt || entry.after.startDate) !== currentStartKey) {
      return false;
    }
    return entry.action === 'create'
      || entry.changedFields?.includes('currentSubscriptionStartedAt')
      || entry.changedFields?.includes('currentSubscriptionCreatedAt');
  });
};

// Repairs proof fields from append-only history and archived receipts. It never turns green back to red.
const reconcileOwnerSubscriptionPaymentProofs = async () => {
  const players = await Player.find({
    isDeleted: { $ne: true },
    currentSubscriptionPaymentConfirmedAt: null
  }).select('_id startDate currentSubscriptionStartedAt currentSubscriptionCreatedAt currentSubscriptionPaymentConfirmedAt').lean();
  if (!players.length) return 0;

  const playerIds = players.map((player) => player._id);
  const [historyEntries, payments] = await Promise.all([
    HistoryEntry.find({ entityType: 'player', entityId: { $in: playerIds } })
      .sort({ changedAt: -1 }).select('entityId action after changedFields changedAt').lean(),
    Payment.find({
      playerId: { $in: playerIds },
      transactionType: { $in: SUBSCRIPTION_PAYMENT_TYPES },
      paidAmount: { $gt: 0 }
    }).sort({ createdAt: 1, _id: 1 }).select('_id playerId paidAmount transactionType createdAt').lean()
  ]);

  const historyByPlayer = new Map();
  historyEntries.forEach((entry) => {
    const key = String(entry.entityId);
    if (!historyByPlayer.has(key)) historyByPlayer.set(key, []);
    historyByPlayer.get(key).push(entry);
  });
  const paymentsByPlayer = new Map();
  payments.forEach((payment) => {
    const key = String(payment.playerId);
    if (!paymentsByPlayer.has(key)) paymentsByPlayer.set(key, []);
    paymentsByPlayer.get(key).push(payment);
  });

  const operations = [];
  players.forEach((player) => {
    const playerKey = String(player._id);
    const cycleEntry = player.currentSubscriptionCreatedAt
      ? null
      : findCycleHistoryEntry(player, historyByPlayer.get(playerKey) || []);
    const cycleCreatedAt = player.currentSubscriptionCreatedAt || cycleEntry?.changedAt;
    if (!cycleCreatedAt) return;

    const matchingPayment = (paymentsByPlayer.get(playerKey) || [])
      .find((payment) => paymentMatchesCycleDay(cycleCreatedAt, payment.createdAt));
    const expectedCycleCreatedAt = player.currentSubscriptionCreatedAt || null;
    const update = { currentSubscriptionCreatedAt: cycleCreatedAt };
    if (matchingPayment) {
      update.currentSubscriptionPaymentConfirmedAt = matchingPayment.createdAt;
      update.currentSubscriptionPaymentId = matchingPayment._id;
    }
    operations.push({
      updateOne: {
        filter: {
          _id: player._id,
          currentSubscriptionCreatedAt: expectedCycleCreatedAt,
          currentSubscriptionPaymentConfirmedAt: null
        },
        update: { $set: update }
      }
    });
  });

  if (!operations.length) return 0;
  const result = await Player.bulkWrite(operations, { ordered: false });
  return result.modifiedCount || 0;
};

module.exports = {
  SUBSCRIPTION_PAYMENT_TYPES,
  beginSubscriptionPaymentProof,
  confirmSubscriptionPaymentProof,
  paymentMatchesCycleDay,
  reconcileOwnerSubscriptionPaymentProofs
};
