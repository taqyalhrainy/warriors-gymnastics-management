const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../public/parent-download/download.js'), 'utf8');

const setup = (fetchImpl) => {
  const elements = {};
  for (const id of ['download', 'cancel', 'progress', 'amount', 'status', 'transfer', 'installation', 'save']) {
    elements[id] = {
      hidden: true, handlers: {}, saves: 0,
      addEventListener(name, handler) { this.handlers[name] = handler; },
      removeAttribute(name) { delete this[name]; },
      click() { this.saves += 1; }
    };
  }
  vm.runInNewContext(source, {
    document: { getElementById: (id) => elements[id] },
    window: { addEventListener() {} },
    fetch: (...args) => fetchImpl(elements, ...args),
    AbortController, Blob, setTimeout, clearTimeout,
    URL: { createObjectURL: () => 'blob:download', revokeObjectURL() {} }
  });
  return elements;
};

test('download progress measures transferred bytes and only saves a complete file', async () => {
  const observed = [];
  const elements = setup(async (ui) => {
    let read = 0;
    return {
      ok: true,
      headers: new Headers({ 'content-type': 'application/vnd.android.package-archive', 'content-length': '4' }),
      body: { getReader: () => ({ read: async () => {
        if (read++) observed.push(ui.progress.value);
        return read <= 2 ? { value: new Uint8Array([1, 2]), done: false } : { done: true };
      } }) }
    };
  });
  await elements.download.handlers.click();
  assert.deepEqual(observed, [50, 100]);
  assert.equal(elements.save.saves, 1);
  assert.equal(elements.installation.hidden, false);
  assert.match(elements.status.textContent, /Finish saving/);
  assert.equal(elements.download.disabled, false);
});

test('server errors do not save HTML as an APK or show installation success', async () => {
  const elements = setup(async () => ({ ok: false }));
  await elements.download.handlers.click();
  assert.equal(elements.save.saves, 0);
  assert.equal(elements.installation.hidden, true);
  assert.match(elements.status.textContent, /failed/);
});

test('Cancel aborts the transfer and keeps retry available', async () => {
  const elements = setup((_ui, _url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  const running = elements.download.handlers.click();
  elements.cancel.handlers.click();
  await running;
  assert.equal(elements.download.disabled, false);
  assert.equal(elements.save.saves, 0);
  assert.match(elements.status.textContent, /stopped/);
});
