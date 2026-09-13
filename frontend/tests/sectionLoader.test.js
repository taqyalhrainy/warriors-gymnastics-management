import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './moduleHarness.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function setup(keys = ['players', 'payments']) {
  let state;
  let cleanup;
  const module = await load('../src/hooks/useSectionLoader.js', {
    react: {
      useState: (initial) => {
        state = initial();
        return [state, (update) => { state = update(state); }];
      },
      useRef: (current) => ({ current }),
      useCallback: (callback) => callback,
      useEffect: (effect) => { cleanup = effect(); }
    }
  });
  const loader = module.useSectionLoader(keys);
  return { ...loader, state: () => state, unmount: () => cleanup(), canShowEmpty: module.canShowEmpty };
}

test('sections publish independently and do not show empty while pending', async () => {
  const loader = await setup();
  const players = deferred();
  const payments = deferred();
  const published = [];
  const first = loader.load('players', () => players.promise, (value) => published.push(value));
  const second = loader.load('payments', () => payments.promise, (value) => published.push(value));
  assert.equal(loader.canShowEmpty(loader.state().players), false);
  players.resolve('players');
  await first;
  assert.deepEqual(published, ['players']);
  assert.equal(loader.state().payments.loading, true);
  assert.equal(loader.canShowEmpty(loader.state().players), true);
  payments.resolve('payments');
  await second;
  assert.deepEqual(published, ['players', 'payments']);
});

test('failure is not empty data and retry clears the error', async () => {
  const loader = await setup();
  await loader.load('players', () => Promise.reject(new Error('offline')), () => assert.fail('must not publish failure'));
  assert.equal(loader.state().players.loading, false);
  assert.ok(loader.state().players.error);
  assert.equal(loader.canShowEmpty(loader.state().players), false);
  await loader.load('players', () => Promise.resolve([]), () => {});
  assert.equal(loader.state().players.error, '');
  assert.equal(loader.canShowEmpty(loader.state().players), true);
});

test('late success and late failure cannot overwrite a newer request', async () => {
  for (const fail of [false, true]) {
    const loader = await setup();
    const old = deferred();
    const published = [];
    const pending = loader.load('players', () => old.promise, (value) => published.push(value));
    await loader.load('players', () => Promise.resolve('new'), (value) => published.push(value));
    if (fail) old.reject(new Error('stale error'));
    else old.resolve('old');
    await pending;
    assert.deepEqual(published, ['new']);
    assert.equal(loader.state().players.error, '');
    assert.equal(loader.state().players.loading, false);
  }
});

test('unmount prevents late publish and state updates', async () => {
  const loader = await setup();
  const request = deferred();
  const pending = loader.load('players', () => request.promise, () => assert.fail('unmounted publish'));
  const before = loader.state();
  loader.unmount();
  request.resolve([]);
  await pending;
  assert.equal(loader.state(), before);
});

test('refresh preserves readiness without showing false empty on error', async () => {
  const loader = await setup();
  let rows;
  await loader.load('players', () => Promise.resolve(['saved']), (value) => { rows = value; });
  await loader.load('players', () => Promise.reject(new Error('timeout')), (value) => { rows = value; });
  assert.deepEqual(rows, ['saved']);
  assert.equal(loader.state().players.ready, true);
  assert.equal(loader.canShowEmpty(loader.state().players), false);
});
