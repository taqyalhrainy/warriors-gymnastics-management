import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';

test('refresh protection stays until all writes finish, including failed requests', async () => {
  const window = new EventTarget();
  const { beginWrite, finishWrite } = await load('../src/services/pendingWrites.js', {}, { window });
  const first = {}, second = {};
  const blocked = () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  assert.equal(blocked(), false);
  beginWrite(first);
  beginWrite(first);
  beginWrite(second);
  assert.equal(blocked(), true);
  finishWrite(first);
  finishWrite(first);
  assert.equal(blocked(), true);
  finishWrite(second);
  assert.equal(blocked(), false);
});
