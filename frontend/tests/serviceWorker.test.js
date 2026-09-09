import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const setup = ({ failDisplay = false } = {}) => {
  const handlers = {};
  const shown = [];
  const receipts = [];
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      registration: {
        showNotification: async (title, options) => {
          if (failDisplay) throw new Error('Permission denied');
          shown.push({ title, options });
        }
      },
      clients: { matchAll: async () => [{ postMessage: (message) => receipts.push(message) }] }
    },
    console: { error() {} }
  });
  return {
    shown, receipts,
    push: async (data) => {
      let lifetime;
      handlers.push({ data, waitUntil: (promise) => { lifetime = promise; } });
      await lifetime;
    }
  };
};

test('closed-app push displays the full message without a page or network request', async () => {
  const { push, shown, receipts } = setup();
  await push({ json: () => ({ title: 'Training', body: 'Practice at 5', notificationId: 'n1', testId: 'probe' }) });
  assert.equal(shown.length, 1);
  assert.equal(shown[0].options.body, 'Practice at 5');
  assert.equal(receipts[0].testId, 'probe');
  assert.equal(receipts[0].displayed, true);
});

test('null or malformed payload still produces a visible notification', async () => {
  const { push, shown } = setup();
  await push({ json: () => null });
  await push({ json: () => { throw new Error('Invalid JSON'); }, text: () => 'Club message' });
  assert.equal(shown.length, 2);
  assert.equal(shown[0].title, 'Warriors Gymnastics');
  assert.equal(shown[1].options.body, 'Club message');
});

test('blocked display reports failure instead of confirming delivery', async () => {
  const { push, receipts } = setup({ failDisplay: true });
  await push({ json: () => ({ testId: 'probe' }) });
  assert.equal(receipts[0].displayed, false);
});
