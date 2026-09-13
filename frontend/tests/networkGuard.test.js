import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

test('connection checks do not overlap and successful requests reset old failures', async () => {
  const window = new EventTarget();
  const document = new EventTarget();
  document.visibilityState = 'visible';
  const timers = new Map();
  let timerId = 0;
  let cleanup;
  let fetches = 0;
  let finishPing;
  const context = vm.createContext({
    window, document, navigator: { onLine: true }, performance, AbortController,
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    fetch: () => { fetches += 1; return new Promise((resolve) => { finishPing = resolve; }); }
  });
  const source = readFileSync(new URL('../src/components/NetworkGuard.jsx', import.meta.url), 'utf8');
  const compiled = transformSync(source, { loader: 'jsx', format: 'esm' }).code;
  const module = new vm.SourceTextModule(compiled, { context });
  await module.link((name) => {
    const exports = name === 'react' ? {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useRef: (current) => ({ current }),
      useEffect: (effect) => { cleanup = effect(); }
    } : { apiHealthURL: 'https://example.test/api/health' };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  module.namespace.default();
  window.dispatchEvent(new Event('online'));
  window.dispatchEvent(new Event('online'));
  assert.equal(fetches, 1);
  finishPing({ ok: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(timers.size, 1);
  const status = (value) => {
    const event = new Event('network:status');
    event.detail = { status: value };
    window.dispatchEvent(event);
  };
  for (let i = 0; i < 4; i++) { status('offline'); status('online'); }
  assert.equal(window.__warriorsNetworkBlocked, false);
  status('offline'); status('offline'); status('offline');
  assert.equal(window.__warriorsNetworkBlocked, true);
  status('online');
  assert.equal(window.__warriorsNetworkBlocked, false);
  cleanup();
  assert.equal(timers.size, 0);
});
