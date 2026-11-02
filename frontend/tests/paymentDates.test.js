import test from 'node:test';
import assert from 'node:assert/strict';
import { getPaymentDayKey, getPaymentMonthKey, mergePaymentRows, mergeConfirmedPaymentRows, rollPaymentDayForward } from '../src/utils/paymentDates.js';

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

test('a confirmed DSR receipt cannot disappear when an older background read finishes', () => {
  const confirmed = [{ _id: 'saved', paidAmount: 70, paymentDate: '2026-11-02T00:00:00.000Z' }];
  assert.deepEqual(mergeConfirmedPaymentRows([], confirmed, {
    view: 'day', day: '2026-11-02'
  }), confirmed);
  assert.deepEqual(mergeConfirmedPaymentRows([], confirmed, {
    view: 'day', day: '2026-11-03'
  }), []);
  assert.deepEqual(mergeConfirmedPaymentRows([{ ...confirmed[0], paidAmount: 80 }], confirmed, {
    view: 'day', day: '2026-11-02'
  }), [{ ...confirmed[0], paidAmount: 80 }]);
});

test('an open payment screen advances to the new Amman day without overwriting a manually selected date', () => {
  assert.deepEqual(rollPaymentDayForward({
    previousToday: '2026-10-13',
    formDay: '2026-10-13',
    selectedDay: '2026-10-13'
  }, '2026-10-13T21:01:00Z'), {
    today: '2026-10-14',
    formDay: '2026-10-14',
    selectedDay: '2026-10-14'
  });

  assert.deepEqual(rollPaymentDayForward({
    previousToday: '2026-10-13',
    formDay: '2026-10-10',
    selectedDay: '2026-10-13',
    preserveFormDay: true
  }, '2026-10-13T21:01:00Z'), {
    today: '2026-10-14',
    formDay: '2026-10-10',
    selectedDay: '2026-10-14'
  });
});
