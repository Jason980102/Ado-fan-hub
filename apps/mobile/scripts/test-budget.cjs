/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
let now = Date.parse('2026-10-18T12:00:00Z');
class Clock extends Date {
  constructor(...args) { if (args.length) super(...args); else super(now); }
  static now() { return now; }
}
function load(relative, imports, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, require: name => imports[name], Date: Clock, AbortController,
    setTimeout, clearTimeout, ...extra,
  });
  return exports;
}
const snapshot = (stale = false) => ({
  source: 'Frankfurter', dates: { USD: '2026-10-18', TWD: '2026-10-18' },
  rates: { JPY: 1, USD: .0067, TWD: .21 }, fetchedAt: new Date(now).toISOString(),
  checkedAt: new Date(now).toISOString(), nextCheckAt: new Date(now + 3600000).toISOString(),
  stale, awaitingPublication: false,
});

async function main() {
  let fetchCalls = 0;
  const budget = load('src/services/budget.ts', {
    './wishlist': { calculateWishlistSubtotal: items => items.reduce((s, x) => s + x.priceJpy * x.quantity, 0) },
  }, {
    process: { env: { EXPO_PUBLIC_API_URL: 'https://example.test/' } },
    fetch: async url => {
      assert.equal(url, 'https://example.test/api/fx/rates');
      fetchCalls++;
      return { ok: true, json: async () => snapshot() };
    },
  });
  assert(budget.isFxSnapshot(snapshot()));
  assert(!budget.isFxSnapshot({ ...snapshot(), dates: { USD: '2026-02-30', TWD: '2026-10-18' } }));
  assert(!budget.isFxSnapshot({ ...snapshot(), rates: { JPY: 1, USD: 0, TWD: .21 } }));
  await budget.fetchBudgetRates();
  assert.equal(fetchCalls, 1);
  assert.equal(budget.calculateBudgetEstimate([{ priceJpy: 1000, quantity: 2 }], 100, 'TWD', snapshot()).convertedTotal, 441);

  const storage = new Map();
  let calls = 0, fail = false, serverStale = false, release = null;
  const cache = load('src/services/budget-cache.ts', {
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    } },
    './budget': { ...budget, fetchBudgetRates: async () => {
      calls++;
      if (release) await release;
      if (fail) throw new Error('offline');
      return snapshot(serverStale);
    } },
  });
  await Promise.all(Array.from({ length: 20 }, () => cache.getBudgetRates()));
  assert.equal(calls, 1, 'concurrent cold reads share one request');
  await cache.getBudgetRates();
  assert.equal(calls, 1, 'fresh cache reused');
  now += 5 * 60000;
  await cache.getBudgetRates();
  assert.equal(calls, 2, 'five-minute TTL expires');
  await cache.getBudgetRates(undefined, true);
  assert.equal(calls, 3, 'retry bypasses device cache');

  assert(!cache.isRateCacheFresh('2026-10-17T23:59:00Z', '2026-10-18T01:00:00Z', Date.parse('2026-10-18T00:01:00Z')));
  assert(!cache.isRateCacheFresh(new Date(now).toISOString(), new Date(now).toISOString(), now));
  assert(!cache.isRateCacheFresh(new Date(now + 60000).toISOString(), new Date(now + 3600000).toISOString(), now));
  const before = new Date(now).toISOString();
  serverStale = true;
  assert((await cache.getBudgetRates(undefined, true)).stale, 'backend stale flag retained');
  now += 6 * 60000;
  fail = true;
  const offline = await cache.getBudgetRates();
  assert(offline.stale);
  assert.equal(offline.snapshot.checkedAt, before, 'failure does not invent a new successful check');

  storage.clear();
  storage.set('@ado-fan-hub/fx-cache/v1', JSON.stringify({
    source: 'Frankfurter', dates: { USD: '2026-10-16', TWD: '2026-10-16' },
    rates: { JPY: 1, USD: .006, TWD: .2 }, fetchedAt: '2026-10-16T12:00:00Z',
  }));
  const legacy = await cache.getBudgetRates();
  assert(legacy.stale);
  assert.equal(legacy.snapshot.rates.TWD, .2, 'v1 offline data survives migration');
  storage.clear();
  await assert.rejects(() => cache.getBudgetRates(), /offline/);

  fail = false;
  let finish;
  release = new Promise(resolve => { finish = resolve; });
  const controller = new AbortController();
  const cancelled = cache.getBudgetRates(controller.signal);
  const survivor = cache.getBudgetRates();
  controller.abort();
  await assert.rejects(() => cancelled, { name: 'AbortError' });
  finish();
  release = null;
  assert.equal((await survivor).snapshot.rates.TWD, .21, 'one cancellation does not abort other consumers');
  await testScreenRefresh(budget, 'android');
  await testScreenRefresh(budget, 'web');
  console.log('PASS: backend URL, validation, conversion, request deduplication, TTL, UTC boundary, retry, stale propagation, offline migration, cancellation.');
}

async function testScreenRefresh(budget, platform) {
  let focus, tick, foreground, visibility, calls = 0, removed = 0;
  const appState = { currentState: 'active', addEventListener: (_, callback) => {
    foreground = callback;
    return { remove: () => { removed++; } };
  } };
  const document = { visibilityState: 'visible', addEventListener: (_, fn) => { visibility = fn; }, removeEventListener: () => { removed++; } };
  const jsx = (type, props) => ({ type, props });
  const screen = load('src/components/wishlist-budget.tsx', {
    'react': { useState: initial => [initial, () => {}], useEffect: () => {}, useCallback: fn => fn },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-router': { useFocusEffect: fn => { focus = fn; } },
    'react-native': { AppState: appState, Platform: { OS: platform }, StyleSheet: { create: value => value } },
    'react-i18next': { useTranslation: () => ({ i18n: { language: 'zh' } }) },
    '@react-native-async-storage/async-storage': { __esModule: true, default: {} },
    '@/constants/fan-theme': { FanColors: {} },
    '@/services/budget': budget,
    '@/services/budget-cache': { getBudgetRates: async () => { calls++; return { snapshot: snapshot(), stale: false }; } },
    '@/services/wishlist': { calculateWishlistSubtotal: () => 0 },
  }, { document, setInterval: fn => { tick = fn; return 1; }, clearInterval: () => { removed++; } });
  screen.default({ items: [] });
  const cleanup = focus();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  assert.equal(calls, 1, platform + ' focus refresh');
  tick();
  await settle();
  assert.equal(calls, 2, platform + ' periodic refresh');
  foreground('active');
  await settle();
  assert.equal(calls, 3, platform + ' foreground refresh');
  if (platform === 'web') { visibility(); await settle(); assert.equal(calls, 4); }
  cleanup();
  assert.equal(removed, platform === 'web' ? 3 : 2, 'listeners and timers removed on blur');
  const previous = calls;
  tick();
  foreground('active');
  await settle();
  assert.equal(calls, previous, 'no refresh after screen blur');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
