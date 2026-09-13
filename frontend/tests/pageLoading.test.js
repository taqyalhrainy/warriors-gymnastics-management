import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { load } from './moduleHarness.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

async function mount(file, services) {
  let cursor = 0;
  const slots = [];
  let effects = [];
  const react = {
    useState(initial) {
      const key = cursor++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], (value) => { slots[key] = typeof value === 'function' ? value(slots[key]) : value; }];
    },
    useRef(current) { const key = cursor++; return slots[key] ||= { current }; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const key = cursor++;
      if (!slots[key] || deps.some((value, index) => value !== slots[key][index])) effects.push(effect);
      slots[key] = deps;
    }
  };
  const hook = await load('../src/hooks/useSectionLoader.js', { react });
  const jsx = (type, props) => ({ type, props: props || {} });
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router-dom': { useParams: () => ({ id: 'player1' }), Link: 'a' },
    '../components/Sidebar.jsx': { default: () => null },
    '../components/DataStatus.jsx': { default: ({ state }) => state?.loading ? 'Loading...' : state?.error ? 'LOAD ERROR' : null },
    '../hooks/useSectionLoader.js': hook,
    '../context/LanguageContext.jsx': { useLanguage: () => ({ t: (key) => key, language: 'en' }) },
    '../utils/format.js': { formatCurrency: (value) => `MONEY:${value}` },
    ...services
  };
  const code = transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'esm' }).code;
  const context = vm.createContext({ console, Date });
  const module = new vm.SourceTextModule(code, { context });
  await module.link((name) => {
    const exports = dependencies[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const text = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (typeof node !== 'object') return String(node);
    return text(typeof node.type === 'function' ? node.type(node.props) : node.props.children);
  };
  return () => {
    cursor = 0;
    const output = text(module.namespace.default());
    const pending = effects;
    effects = [];
    pending.forEach((effect) => effect());
    return output;
  };
}

test('player profile appears before payment/history requests and never shows a fake zero', async () => {
  const player = deferred(), payments = deferred(), attendance = deferred();
  const render = await mount('../src/pages/PlayerProfile.jsx', {
    '../services/players.js': { getPlayer: () => player.promise, updatePlayer: () => {} },
    '../services/payments.js': { fetchPaymentsByPlayer: () => payments.promise },
    '../services/attendance.js': { fetchAttendanceByPlayer: () => attendance.promise }
  });
  assert.match(render(), /Loading/);
  player.resolve({ _id: 'player1', fullName: 'Ready Player', payment: 100 });
  await new Promise(setImmediate);
  const partial = render();
  assert.match(partial, /Ready Player/);
  assert.match(partial, /Total Paid:\s+Loading/);
  assert.doesNotMatch(partial, /No attendance history found/);
  payments.resolve([{ paidAmount: 75 }]);
  attendance.resolve([]);
  await new Promise(setImmediate);
  const finished = render();
  assert.match(finished, /Total Paid:\s+MONEY:75/);
  assert.match(finished, /No attendance history found/);
});

test('failed history does not remove a loaded player or display no records', async () => {
  const attendance = deferred();
  const render = await mount('../src/pages/PlayerProfile.jsx', {
    '../services/players.js': { getPlayer: async () => ({ fullName: 'Visible Player' }), updatePlayer: () => {} },
    '../services/payments.js': { fetchPaymentsByPlayer: async () => [] },
    '../services/attendance.js': { fetchAttendanceByPlayer: () => attendance.promise }
  });
  render();
  attendance.reject(new Error('timeout'));
  await new Promise(setImmediate);
  const output = render();
  assert.match(output, /Visible Player/);
  assert.match(output, /LOAD ERROR/);
  assert.doesNotMatch(output, /No attendance history found/);
});

test('players table renders rows while unrelated group options are pending', async () => {
  const players = deferred(), groups = deferred();
  const unused = () => {};
  const render = await mount('../src/pages/Players.jsx', {
    '../services/players.js': { fetchPlayers: () => players.promise, deletePlayer: unused, createPlayer: unused },
    '../services/groups.js': { fetchGroups: () => groups.promise },
    '../services/parents.js': { fetchParents: async () => [], createParent: unused },
    '../services/packageOptions.js': { fetchPackageOptions: async () => [] },
    '../services/waitingList.js': { fetchWaitingList: async () => [], createWaitingListEntry: unused, deleteWaitingListEntry: unused, updateWaitingListEntry: unused },
    '../utils/confirmAction.js': { confirmAction: unused },
    '../utils/numberInput.js': { normalizeDigits: (value) => value, parseLocalizedNumber: Number },
    '../utils/imageUpload.js': { compressProfileImage: unused }
  });
  const initial = render();
  assert.match(initial, /Loading/);
  assert.doesNotMatch(initial, /noPlayersYet/);
  players.resolve([{ _id: '1', fullName: 'Fast Player', status: 'active' }]);
  await new Promise(setImmediate);
  const partial = render();
  assert.match(partial, /Fast Player/);
  assert.match(partial, /Loading/);
  assert.doesNotMatch(partial, /noPlayersYet/);
  groups.resolve([]);
  await new Promise(setImmediate);
  assert.doesNotMatch(render(), /Loading/);
});
