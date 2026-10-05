export const getRemainingAmount = (player) => Math.max(0,
  player?.attendanceDueManual ? Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0) : 0
);

export const sumRemainingByPlayer = (payments) => {
  const balances = new Map();
  for (const payment of payments) {
    const key = String(payment.playerId?._id || payment.playerId || payment._id);
    balances.set(key, Math.max(balances.get(key) || 0, Number(payment.remainingAmount || 0)));
  }
  return [...balances.values()].reduce((sum, value) => sum + value, 0);
};
