const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeParentPayments } = require('../utils/parentPaymentSummary');

test('package price is not money paid, and other children cannot contribute', () => {
  const players = [{ _id: 'a', payment: 100 }];
  assert.equal(summarizeParentPayments(players, []).get('a'), 0);
  assert.equal(summarizeParentPayments(players, [{ playerId: 'b', paidAmount: 100 }]).get('a'), 0);
});

test('current-cycle totals match admin for booking dates and entered-later payments', () => {
  const players = [{ _id: 'a', currentSubscriptionStartedAt: '2026-09-08' }];
  const rows = [
    { playerId: 'a', paidAmount: 100, createdAt: '2026-09-07', paymentDate: '2026-09-09' },
    { playerId: { _id: 'a' }, paidAmount: 25, createdAt: '2026-09-08', paymentDate: '2026-09-01' },
    { playerId: 'a', paidAmount: 10, createdAt: '2026-09-09', transactionType: 't-shirt' }
  ];
  assert.equal(summarizeParentPayments(players, rows).get('a'), 135);
});

test('without renewal marker uses start date, or all payments if no start date', () => {
  const rows = [
    { playerId: 'a', paidAmount: 50, paymentDate: '2026-09-07' },
    { playerId: 'a', paidAmount: 20, paymentDate: '2026-09-08' }
  ];
  assert.equal(summarizeParentPayments([{ _id: 'a', startDate: '2026-09-08' }], rows).get('a'), 20);
  assert.equal(summarizeParentPayments([{ _id: 'a' }], rows).get('a'), 70);
});

test('payment recorded for a newly created cycle counts before its future class start date', () => {
  const players = [{
    _id: 'a',
    currentSubscriptionCreatedAt: '2026-10-21T10:00:00.000Z',
    currentSubscriptionStartedAt: '2026-10-24T00:00:00.000Z'
  }];
  const rows = [{
    _id: 'payment-current',
    playerId: 'a',
    paidAmount: 100,
    createdAt: '2026-10-21T10:05:00.000Z',
    paymentDate: '2026-10-21T00:00:00.000Z'
  }];
  assert.equal(summarizeParentPayments(players, rows).get('a'), 100);
});

test('a payment from before the current cycle is not reused even when its date was future-dated', () => {
  const players = [{
    _id: 'a',
    currentSubscriptionCreatedAt: '2026-10-21T10:00:00.000Z',
    currentSubscriptionStartedAt: '2026-10-24T00:00:00.000Z'
  }];
  const rows = [{
    _id: 'payment-previous',
    playerId: 'a',
    paidAmount: 100,
    createdAt: '2026-10-20T10:00:00.000Z',
    paymentDate: '2026-10-25T00:00:00.000Z'
  }];
  assert.equal(summarizeParentPayments(players, rows).get('a'), 0);
});
