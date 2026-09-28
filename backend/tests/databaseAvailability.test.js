const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { databaseHealth } = require('../utils/databaseAvailability');
const errorHandler = require('../middleware/errorHandler');

const response = () => ({ code: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const dbError = Object.assign(new Error('bad auth : authentication failed'), { name: 'MongoServerError', code: 8000 });

test('database authentication failure is a service error, not a logout', async () => {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/auth'), 'utf8'), {
    module, process: { env: { JWT_SECRET: 'test' } },
    require: (name) => name === 'jsonwebtoken'
      ? { verify: () => ({ id: 'admin' }) }
      : { findById: () => ({ select: async () => { throw dbError; } }) }
  });
  const res = response();
  let forwarded;
  await module.exports.protect({ headers: { authorization: 'Bearer valid' } }, res, (error) => { forwarded = error; });
  assert.equal(forwarded, dbError);
  errorHandler(forwarded, {}, res, () => {});
  assert.equal(res.code, 503);
  assert.doesNotMatch(res.body.message, /bad auth|Unauthorized|token/);
});

test('health checks actual database access and recovers after credentials are repaired', async () => {
  let broken = true;
  const connection = { readyState: 1, db: { admin: () => ({ command: async () => { if (broken) throw dbError; } }) } };
  const health = databaseHealth(connection, () => true);
  const failed = response();
  await health({}, failed);
  assert.equal(failed.code, 503);
  assert.equal(failed.body.database, 'unavailable');
  assert.equal(failed.headers['Cache-Control'], 'no-store');
  broken = false;
  const restored = response();
  await health({}, restored);
  assert.equal(restored.code, 200);
  assert.equal(restored.body.status, 'ok');
});
