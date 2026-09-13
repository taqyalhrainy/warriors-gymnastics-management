import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';
import * as cache from '../src/services/cache.js';

test('fresh payment loads deduplicate by filters, not timestamp, and edits invalidate them', async () => {
  cache.clearCache();
  const requests = [];
  const pending = [];
  const payments = await load('../src/services/payments.js', {
    './api.js': { default: { get: (url, config) => {
      requests.push({ url, params: config.params });
      return new Promise((resolve) => pending.push(resolve));
    } } },
    './cache.js': cache
  });
  const first = payments.fetchPayments({ day: '2026-09-13', fresh: 1 });
  const duplicate = payments.fetchPayments({ fresh: 2, day: '2026-09-13' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].params.fresh, undefined);
  const anotherDay = payments.fetchPayments({ day: '2026-09-12' });
  assert.equal(requests.length, 2);
  pending[0]({ data: ['today'] });
  pending[1]({ data: ['yesterday'] });
  assert.deepEqual(await first, ['today']);
  assert.deepEqual(await duplicate, ['today']);
  assert.deepEqual(await anotherDay, ['yesterday']);
  assert.deepEqual(await payments.fetchPayments({ day: '2026-09-13' }), ['today']);
  cache.invalidateCache('payments:');
  const refreshed = payments.fetchPayments({ day: '2026-09-13' });
  assert.equal(requests.length, 3);
  pending[2]({ data: ['updated'] });
  assert.deepEqual(await refreshed, ['updated']);
});
