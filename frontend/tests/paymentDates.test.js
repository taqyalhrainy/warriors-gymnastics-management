import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentDayKey, getPaymentMonthKey, mergePaymentRows } from '../src/utils/paymentDates.js';

test('payment calendar follows Amman across day, month and year rollover regardless of device timezone', () => {
  const before = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timezone;
      assert.equal(getPaymentDayKey('2026-10-07T21:30:00Z'), '2026-10-08');
      assert.equal(getPaymentDayKey('2026-10-08T20:59:59Z'), '2026-10-08');
      assert.equal(getPaymentDayKey('2026-10-08T21:00:00Z'), '2026-10-09');
      assert.equal(getPaymentMonthKey('2026-09-30T21:00:00Z'), '2026-10');
      assert.equal(getPaymentDayKey('2026-12-31T21:00:00Z'), '2027-01-01');
      assert.equal(getPaymentDayKey('2026-10-08'), '2026-10-08');
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test('a payment moving between pagination boundaries remains one row with its latest saved amount', () => {
  const merged = mergePaymentRows([{ _id: 'a', paidAmount: 10 }, { _id: 'b', paidAmount: 20 }],
    [{ _id: 'b', paidAmount: 25 }, { _id: 'c', paidAmount: 30 }]);
  assert.deepEqual(merged, [{ _id: 'a', paidAmount: 10 }, { _id: 'b', paidAmount: 25 }, { _id: 'c', paidAmount: 30 }]);
});
