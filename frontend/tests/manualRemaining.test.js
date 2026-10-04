import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { getRemainingAmount, sumRemainingByPlayer } from '../src/utils/manualRemaining.js';

const backend = createRequire(import.meta.url)('../../backend/utils/manualRemaining.js');

test('client and server remaining use only fixed carried balances and manual entries', () => {
  const cases = [
    [{ payment: 100, paidAmount: 20 }, 0],
    [{ payment: 900, subscriptionId: { price: 900 }, previousDueBalance: 70, attendanceDueManual: true }, 70],
    [{ payment: 900, previousDueBalance: 0, attendanceDueManual: true }, 0],
    [{ previousDueBalance: 70, dueAdjustment: 10, attendanceDueManual: true }, 60],
    [{ preservedRemainingBalance: 70, payment: 999 }, 70],
    [{ preservedRemainingBalance: 70, previousDueBalance: 70, dueAdjustment: 10, attendanceDueManual: true }, 130],
    [{ previousDueBalance: -20, attendanceDueManual: true }, 0]
  ];
  for (const [player, amount] of cases) {
    assert.equal(getRemainingAmount(player), amount);
    assert.equal(backend.getRemainingAmount(player), amount);
  }
});

test('repeated payment rows cannot multiply a player remaining balance', () => {
  assert.equal(sumRemainingByPlayer([
    { _id: '1', playerId: { _id: 'a' }, remainingAmount: 70 },
    { _id: '2', playerId: 'a', remainingAmount: 70 },
    { _id: '3', playerId: 'a', remainingAmount: 0 },
    { _id: '4', playerId: 'b', remainingAmount: 30 }
  ]), 100);
});
