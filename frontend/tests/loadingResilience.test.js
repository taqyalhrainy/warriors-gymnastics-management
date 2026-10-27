import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const loadAuthWake = async ({ waitForApiHealth, native = false }) => {
  const context = vm.createContext({});
  const source = readFileSync(new URL('../src/services/authWake.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link((name) => {
    const exports = name === './api.js'
      ? { waitForApiHealth }
      : { isNativeAndroidApp: () => native };
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace.sendAuthWithWakeRetry;
};

test('login waits for one shared health recovery and retries credentials only once', async () => {
  const healthOptions = [];
  const send = await loadAuthWake({ waitForApiHealth: async (options) => healthOptions.push(options) });
  let attempts = 0;
  let waiting = false;
  const result = await send(async () => {
    attempts += 1;
    if (attempts === 1) throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' });
    return { ok: true };
  }, (value) => { waiting = value; });

  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
  assert.equal(waiting, true);
  assert.equal(healthOptions.length, 1);
  assert.equal(healthOptions[0].maxWaitMs, 90000);
});

test('login errors from the server never trigger wake retries', async () => {
  let healthChecks = 0;
  const send = await loadAuthWake({ waitForApiHealth: async () => { healthChecks += 1; } });
  let attempts = 0;
  await assert.rejects(() => send(async () => {
    attempts += 1;
    throw { response: { status: 401 } };
  }));
  assert.equal(attempts, 1);
  assert.equal(healthChecks, 0);
});

test('keep-awake is frequent, offset, and fails visibly when Render is unhealthy', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/keep-render-awake.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron: '3-59\/5 \* \* \* \*'/);
  assert.match(workflow, /--fail-with-body/);
  assert.doesNotMatch(workflow, /\|\| true/);
  assert.match(workflow, /data\.database!=='connected'/);
});

test('startup repair is delayed and throttled away from the first user request', () => {
  const server = readFileSync(new URL('../../backend/server.js', import.meta.url), 'utf8');
  const players = readFileSync(new URL('../../backend/controllers/playerController.js', import.meta.url), 'utf8');
  assert.match(server, /reconcileLinkedSubscriptions\(\{ batchSize: 5, pauseMs: 75 \}\)/);
  assert.match(server, /2 \* 60 \* 1000/);
  assert.match(players, /const pauseMs = Math\.max\(0, Number\(options\.pauseMs \|\| 0\)\)/);
});
