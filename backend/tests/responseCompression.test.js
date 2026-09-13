const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const compression = require('compression');
const http = require('node:http');
const { gunzipSync } = require('node:zlib');

test('large API responses arrive compressed with identical data and support identity clients', async () => {
  const app = express();
  app.use('/api', compression({ level: 1 }));
  const rows = Array.from({ length: 200 }, (_, id) => ({ id, paidTotal: 0, payment: 100, status: 'active' }));
  app.get('/api/players', (req, res) => res.json(rows));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const request = (encoding) => new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${server.address().port}/api/players`, { headers: { 'Accept-Encoding': encoding } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
  try {
    const compressed = await request('gzip');
    const plain = await request('identity');
    assert.equal(compressed.headers['content-encoding'], 'gzip');
    assert.match(compressed.headers.vary, /Accept-Encoding/);
    assert.deepEqual(JSON.parse(gunzipSync(compressed.body)), rows);
    assert.deepEqual(JSON.parse(plain.body), rows);
    assert.ok(compressed.body.length < plain.body.length / 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
