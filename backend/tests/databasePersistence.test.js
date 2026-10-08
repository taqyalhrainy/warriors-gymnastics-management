const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

test('production never accepts financial writes into a temporary database when its URI is missing', async () => {
  for (const env of [{ NODE_ENV: 'production' }, { RENDER: 'true' }]) {
    let connects = 0;
    let exits = 0;
    const context = vm.createContext({
      process: { env, exit: (code) => { assert.equal(code, 1); exits++; } },
      console: { error: () => {}, log: () => {} }, module: { exports: {} },
      require: (name) => {
        if (name === 'mongoose') return { set: () => {}, connect: () => { connects++; } };
        if (name === 'dns') return {};
        assert.fail('A temporary database must never be loaded in production: ' + name);
      }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../config/db.js'), 'utf8'), context);
    await context.module.exports();
    assert.equal(connects, 0);
    assert.equal(exits, 1);
  }
});
