import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key) };
};
export async function load(file, dependencies, globals = {}) {
  const context = vm.createContext(globals);
  const module = new vm.SourceTextModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { context });
  await module.link((name) => {
    const exports = dependencies[name];
    assert.ok(exports, 'Unexpected dependency: ' + name);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}
