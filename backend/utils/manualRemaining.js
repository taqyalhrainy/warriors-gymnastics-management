// Only the explicit attendance balance is current debt. Legacy automatic
// balances remain archived on the document but must never contribute here.
const getRemainingAmount = (player) => Math.max(0,
  player?.attendanceDueManual ? Number(player.previousDueBalance || 0) - Number(player.dueAdjustment || 0) : 0
);

module.exports = { getRemainingAmount };
