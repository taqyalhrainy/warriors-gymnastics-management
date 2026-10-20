import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAYMENT_PLAYER_MODES,
  getPaymentPlayerMode,
  playerMatchesPaymentMode
} from '../src/utils/paymentPlayerModes.js';

test('payment player mode separates active and frozen players', () => {
  const active = { _id: 'active-player', status: 'active' };
  const frozen = { _id: 'frozen-player', status: 'frozen' };

  assert.equal(playerMatchesPaymentMode(active, PAYMENT_PLAYER_MODES.ACTIVE), true);
  assert.equal(playerMatchesPaymentMode(active, PAYMENT_PLAYER_MODES.FROZEN), false);
  assert.equal(playerMatchesPaymentMode(frozen, PAYMENT_PLAYER_MODES.ACTIVE), false);
  assert.equal(playerMatchesPaymentMode(frozen, PAYMENT_PLAYER_MODES.FROZEN), true);
});

test('existing payments reopen under the current player status', () => {
  assert.equal(getPaymentPlayerMode({ status: 'frozen' }), PAYMENT_PLAYER_MODES.FROZEN);
  assert.equal(getPaymentPlayerMode({ status: 'active' }), PAYMENT_PLAYER_MODES.ACTIVE);
  assert.equal(getPaymentPlayerMode({}), PAYMENT_PLAYER_MODES.ACTIVE);
});
