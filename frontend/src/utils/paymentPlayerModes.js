export const PAYMENT_PLAYER_MODES = Object.freeze({
  ACTIVE: 'active',
  FROZEN: 'frozen',
  CUSTOM: 'custom'
});

export const getPaymentPlayerMode = (player) => (
  player?.status === PAYMENT_PLAYER_MODES.FROZEN
    ? PAYMENT_PLAYER_MODES.FROZEN
    : PAYMENT_PLAYER_MODES.ACTIVE
);

export const playerMatchesPaymentMode = (player, payerMode) => {
  const status = player?.status || PAYMENT_PLAYER_MODES.ACTIVE;
  return payerMode === PAYMENT_PLAYER_MODES.FROZEN
    ? status === PAYMENT_PLAYER_MODES.FROZEN
    : status === PAYMENT_PLAYER_MODES.ACTIVE;
};
