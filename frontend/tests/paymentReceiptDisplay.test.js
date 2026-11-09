import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

async function renderPayments(payments) {
  const slots = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const key = cursor++;
      if (!(key in slots)) slots[key] = typeof initial === 'function' ? initial() : initial;
      return [slots[key], () => {}];
    },
    useEffect() {}
  };
  const jsx = (type, props) => ({ type, props: props || {} });
  const dependencies = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router-dom': { useNavigate: () => () => {} },
    '../components/Sidebar.jsx': { default: () => null },
    '../components/DataStatus.jsx': { default: () => null },
    '../services/parents.js': { fetchParentPayments: async () => [], getCachedParentPaymentsPage: () => ({ items: payments, total: payments.length }) },
    '../context/LanguageContext.jsx': { useLanguage: () => ({ t: (key) => key }) },
    '../assets/warriors-logo.png': { default: 'logo.png' }
  };
  const code = transformSync(readFileSync(new URL('../src/pages/ParentPayments.jsx', import.meta.url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'esm' }).code;
  const context = vm.createContext({ Date });
  const module = new vm.SourceTextModule(code, { context });
  await module.link((name) => {
    const exports = dependencies[name];
    assert.ok(exports, name);
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  const nodes = [];
  const text = (node) => {
    if (node == null || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(text).join(' ');
    if (typeof node !== 'object') return String(node);
    if (typeof node.type === 'function') return text(node.type(node.props));
    const content = text(node.props.children);
    nodes.push({ ...node, text: content });
    return content;
  };
  text(module.namespace.default());
  return nodes;
}

test('each parent receipt renders 80 while the summary shows 160, including with the old API payload', async () => {
  const nodes = await renderPayments([1, 2].map((id) => ({
    _id: String(id), playerId: { _id: 'child', fullName: 'Child', currentSubscriptionPaidAmount: 160 },
    paidAmount: 80, visiblePaidAmount: 160, paymentDate: '2026-11-10', paymentMethod: 'Cash'
  })));
  assert.deepEqual(nodes.filter((node) => node.props.className === 'parent-paid-amount').map((node) => node.text), ['80', '80']);
  assert.match(nodes.find((node) => node.props.className === 'parent-hero-stats').text, /paid 160/);
});

test('old receipts, purchases and due-only rows keep their stored payment amount', async () => {
  const nodes = await renderPayments([40, 15, 0].map((paidAmount, id) => ({
    _id: String(id), playerId: { _id: 'child', currentSubscriptionPaidAmount: 80 },
    paidAmount, visiblePaidAmount: 80, paymentDate: '2026-10-10'
  })));
  assert.deepEqual(nodes.filter((node) => node.props.className === 'parent-paid-amount').map((node) => node.text), ['40', '15', '0']);
});
