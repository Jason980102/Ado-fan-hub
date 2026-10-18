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
function load(file, imports = {}, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, require: key => {
    if (!(key in imports)) throw new Error('Missing test import: ' + key);
    return imports[key];
  }, Date: Clock, AbortController, setTimeout, clearTimeout, ...extra });
  return exports;
}
const wrap = value => ({ __esModule: true, default: value });
const theme = { id: 1, slug: 'Pusheen', title: 'Pusheen theme', image_url: null, visual_kind: 'none',
  url: 'https://ado-officialshop-friedpotato.com/shops/Pusheen', campaign_status: 'active', wishlist_eligible: true,
  campaign_ends_at: '2026-10-27T00:00:00+09:00', campaign_source_url: null };
const product = { slug: 'test', title: 'Test shirt', price_jpy: 1000, image_url: null, status: 'sold_out', labels: [],
  url: 'https://ado-officialshop-friedpotato.com/products/test' };
const settle = () => new Promise(resolve => setImmediate(resolve));

async function main() {
  let status = 'active', offline = false, waitForStatus = null;
  const api = load('src/services/shop-api.ts', {}, {
    process: { env: { EXPO_PUBLIC_API_URL: 'https://api.example.test' } },
    fetch: async url => {
      if (offline) throw new Error('offline');
      if (url.includes('/campaign-status?')) {
        if (waitForStatus) await waitForStatus;
        const slugs = decodeURIComponent(url.split('slugs=')[1]).split(',');
        return { ok: true, json: async () => ({ campaigns: slugs.map(slug => ({ slug,
          campaign_status: slug === 'Unknown' ? 'unverified' : status,
          wishlist_eligible: slug !== 'Unknown' && status === 'active',
          campaign_ends_at: slug === 'Unknown' || status === 'unverified' ? null : theme.campaign_ends_at })) }) };
      }
      assert(url.endsWith('/api/shop/sold-out?page=1'));
      return { ok: true, json: async () => ({ source: 'test', checked_at: new Date(now).toISOString(),
        cached: true, stale: false, items: [{ theme, product }], total: 1, page: 1, has_more: false }) };
    },
  });
  assert.equal((await api.getSoldOutProducts(1, new AbortController().signal)).items.length, 1);
  assert(api.isShopThemeActive(theme));
  assert(!api.isShopThemeActive(theme, Date.parse(theme.campaign_ends_at)));
  const storage = new Map();
  const asyncStorage = { getItem: async key => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); } };
  const wishlist = load('src/services/wishlist.ts', {
    '@react-native-async-storage/async-storage': wrap(asyncStorage), './shop-api': api,
  });
  for (const state of ['available', 'sold_out']) {
    storage.clear();
    await wishlist.addToWishlist(theme, { ...product, status: state }, 1, { Size: 'M' });
    await Promise.all(Array.from({ length: 10 }, () => wishlist.addToWishlist(theme, { ...product, status: state }, 1, { Size: 'M' })));
    assert.equal((await wishlist.loadWishlist())[0].quantity, 11, 'serialized additions retain quantities');
  }
  const before = (await wishlist.loadWishlist())[0];
  now = Date.parse(theme.campaign_ends_at);
  assert.equal(wishlist.getWishlistCampaignStatus(before), 'ended', 'exact deadline applies offline');
  await assert.rejects(() => wishlist.addToWishlist(theme, product), /Campaign not available/);
  status = 'ended';
  const ended = await wishlist.refreshWishlistCampaigns(new AbortController().signal);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].id, before.id);
  assert.equal(ended[0].quantity, 11);
  assert.equal(ended[0].selectedOptions.Size, 'M');
  assert.equal(ended[0].campaignStatus, 'ended');
  status = 'unverified';
  assert.equal((await wishlist.refreshWishlistCampaigns(new AbortController().signal))[0].campaignStatus, 'ended', 'ended items cannot be resurrected by missing metadata');
  offline = true;
  assert.equal((await wishlist.refreshWishlistCampaigns(new AbortController().signal))[0].campaignStatus, 'ended');

  now = Date.parse('2026-10-18T12:00:00Z');
  offline = false; status = 'active'; storage.clear();
  const item = (await wishlist.addToWishlist(theme, product))[0];
  let release;
  waitForStatus = new Promise(resolve => { release = resolve; });
  const refresh = wishlist.refreshWishlistCampaigns(new AbortController().signal);
  await settle();
  await wishlist.updateWishlistQuantity(item.id, 4);
  release();
  assert.equal((await refresh)[0].quantity, 4, 'status refresh preserves concurrent quantity edit');
  waitForStatus = null;

  let prepared = 0;
  const restock = load('src/services/restock.ts', {
    '@react-native-async-storage/async-storage': wrap(asyncStorage),
    './push-device': { getPushIdentity: async () => null, preparePushDevice: async () => { prepared++; throw new Error('must not request permission'); } },
  }, {
    process: { env: { EXPO_PUBLIC_API_URL: 'https://api.example.test' } },
    fetch: async url => { assert(url.endsWith('/api/push/config')); return { ok: true, json: async () => ({ enabled: false, projectId: null }) }; },
  });
  await assert.rejects(() => restock.setRestockSubscription('Pusheen', 'test', true, 'zh'), /push_not_configured/);
  assert.equal(prepared, 0, 'disabled push must not ask for device permission or claim subscription');

  await testNativeStartup();
  renderScreens(api, wishlist, ended[0]);
  console.log('PASS: sold-out API, active/expired boundaries, available/sold-out wishlist adds, concurrent writes, permanent ended retention, offline retention, unconfigured push, sold-out section placement, history filtering, wishlist ended label.');
}

async function testNativeStartup() {
  const projectId = '12345678-1234-1234-1234-123456789012';
  for (const constants of [
    { executionEnvironment: 'storeClient', expoConfig: { extra: { eas: { projectId } } } },
    { executionEnvironment: 'bare', expoConfig: {} },
  ]) {
    const imports = [];
    const native = load('src/services/push-device.native.ts', {}, {
      require: key => {
        imports.push(key);
        if (key === 'expo-constants') return wrap(constants);
        if (key === 'react-native') return { Platform: { OS: 'android' } };
        throw new Error('Native push dependency must not load at startup: ' + key);
      },
    });
    assert.equal(await native.getPushIdentity(), null);
    const stop = native.observePush(() => {}, () => {});
    stop();
    await settle();
    await assert.rejects(() => native.preparePushDevice(projectId), /push_development_build|push_not_configured/);
    assert(!imports.includes('expo-notifications'));
    assert(!imports.includes('expo-secure-store'));
    assert(!imports.includes('expo-crypto'));
  }

  let saved = null, listeners = 0, removed = 0;
  const native = load('src/services/push-device.native.ts', {
    'expo-constants': wrap({ executionEnvironment: 'bare', expoConfig: { extra: { eas: { projectId } } } }),
    'react-native': { Platform: { OS: 'android' } },
    'expo-secure-store': { getItemAsync: async () => saved, setItemAsync: async (_, value) => { saved = value; } },
    'expo-crypto': { getRandomBytesAsync: async () => new Uint8Array(32).fill(9), randomUUID: () => projectId },
    'expo-notifications': {
      AndroidImportance: { DEFAULT: 3 }, setNotificationChannelAsync: async () => {},
      getPermissionsAsync: async () => ({ status: 'granted' }),
      getExpoPushTokenAsync: async () => ({ data: 'ExpoPushToken[test1234567890]' }),
      setNotificationHandler: () => {}, getLastNotificationResponse: () => null,
      addNotificationResponseReceivedListener: () => { listeners++; return { remove: () => { removed++; } }; },
      addPushTokenListener: () => { listeners++; return { remove: () => { removed++; } }; },
    },
  });
  const stoppedBeforeLoad = native.observePush(() => {}, () => {});
  stoppedBeforeLoad();
  await settle();
  assert.equal(listeners, 0, 'disposing before async initialization must not leak listeners');
  const prepared = await native.preparePushDevice(projectId);
  assert.equal(prepared.identity.secret.length, 64);
  assert.equal(prepared.token, 'ExpoPushToken[test1234567890]');
  const stop = native.observePush(() => {}, () => {});
  await settle();
  assert.equal(listeners, 2);
  stop();
  assert.equal(removed, 2);
  console.log('PASS: Expo Go and unconfigured startup never load native push dependencies; configured push still initializes and cleans up.');
}

function renderScreens(api, wishlist, endedItem) {
  const jsx = (type, props) => ({ type, props });
  const native = { StyleSheet: { create: v => v }, Platform: { OS: 'web' },
    ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View',
    Linking: { openURL: async () => {} }, AppState: {} };
  const common = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'react-i18next': { useTranslation: () => ({ i18n: { language: 'zh', resolvedLanguage: 'zh' } }) },
    'expo-router': { useFocusEffect: () => {}, useRouter: () => ({ push: () => {} }), useLocalSearchParams: () => ({}) },
    '@/constants/fan-theme': { FanColors: {} }, '@/constants/fan-page-header': { fanPageHeader: {} },
    '@/components/rose-scroll-view': wrap('Scroll'),
    '@/hooks/use-web-layout': { useWebLayout: () => ({ width: 390, contentStyle: {} }) },
    '@/hooks/use-campaign-clock': { useCampaignClock: () => now },
  };
  const descendants = node => !node ? [] : Array.isArray(node) ? node.flatMap(descendants)
    : typeof node === 'object' ? [node, ...descendants(node.props?.children)] : [node];
  const renderShop = archive => {
    let slot = 0;
    const view = load('src/app/shop.tsx', { ...common,
      'react': { useState: initial => {
        const index = slot++;
        return [index === 0 ? { themes: [theme], checked_at: new Date(now).toISOString(), stale: false } : index === 2 ? archive : index === 7 ? false : initial, () => {}];
      }, useRef: initial => ({ current: initial }), useCallback: fn => fn },
      '@/services/shop-api': api, '@/services/wishlist': wishlist,
      '@/contexts/preferences-context': { usePreferences: () => ({ preferences: { timeZone: 'UTC' } }) },
      '@/components/explore-icon': wrap('ExploreIcon'), '@/components/shop-product-picker': { ShopProductPicker: 'Picker' },
      '@/components/sold-out-products': wrap('SoldOutProducts'),
    }).default();
    const scroll = descendants(view).find(n => n?.type === 'Scroll');
    const children = scroll.props.children.flat(Infinity).filter(Boolean);
    const soldIndex = children.findIndex(n => n.type === 'SoldOutProducts');
    if (!archive) {
      const themeIndex = children.findIndex(n => descendants(n).some(x => x === theme.title));
      const officialIndex = children.findIndex(n => n.type === 'Pressable' && descendants(n).includes('前往官方網站 ↗'));
      assert(soldIndex > themeIndex && soldIndex < officialIndex, 'sold-out list must be a sibling BELOW theme blocks and ABOVE final official link');
    } else assert.equal(soldIndex, -1, 'historical themes must not show current sold-out section');
    return view;
  };
  renderShop(false);
  renderShop(true);
  now = Date.parse(theme.campaign_ends_at);
  const current = descendants(renderShop(false));
  assert(!current.includes(theme.title), 'expired theme leaves current section');
  assert(descendants(renderShop(true)).includes(theme.title), 'expired theme appears in history');

  let slot = 0;
  const screen = load('src/app/wishlist.tsx', { ...common,
    'react': { useState: initial => {
      const index = slot++;
      return [index === 0 ? [endedItem] : index === 1 ? false : initial, () => {}];
    }, useRef: value => ({ current: value }), useCallback: fn => fn },
    '@/components/wishlist-budget': wrap('Budget'), '@/services/wishlist': wishlist,
  }).default();
  const nodes = descendants(screen);
  assert(nodes.includes('販售結束'));
  assert(nodes.includes(endedItem.title), 'ended item remains displayed');
  assert(nodes.includes('移除'), 'only explicit user removal deletes a saved item');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
