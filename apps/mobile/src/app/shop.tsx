import SoldOutProducts from '@/components/sold-out-products';
import { useCampaignClock } from '@/hooks/use-campaign-clock';
import { fanPageHeader } from '@/constants/fan-page-header';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, AppState, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import RoseScrollView from '@/components/rose-scroll-view';
import ExploreIcon from '@/components/explore-icon';
import { useWebLayout } from '@/hooks/use-web-layout';
import { usePreferences } from '@/contexts/preferences-context';
import { FanColors as C } from '@/constants/fan-theme';
import { getShopThemes, getShopProducts, isShopThemeActive, type ShopTheme, type ShopProduct, type ThemesResponse, type ProductsResponse } from '@/services/shop-api';
import { addToWishlist } from '@/services/wishlist';
import { ShopProductPicker } from '@/components/shop-product-picker';

const copy = {
  zh: { title: '官方商店目錄', intro: '探索官方目前公開的活動主題與商品。', themes: '主題目錄', browse: '瀏覽商品 →', back: '← 返回主題', official: '前往官方網站 ↗', error: '目錄暫時無法載入，請重試。', retry: '重試', more: '載入更多商品', empty: '這個主題目前沒有公開列出的商品。', stale: '目前顯示先前取得的資料，請至官方網站確認最新狀態。', note: '價格為日圓；庫存、規格及購買資格請以官方網站為準。', quantity: '件數', increase: '增加件數', decrease: '減少件數', selectionNote: '僅記錄本頁件數，尚未加入官方購物車。', preview: '商品預覽', checked: '資料取得時間', available: '可購買・以官方為準', ended: '販售結束', sold_out: '售罄', upcoming: '尚未開賣', unknown: '請至官方確認', loaded: '已載入商品', linkError: '無法開啟官方網站。', end: '已顯示此主題目前公開的所有商品。' },
  en: { title: 'Official shop catalogue', intro: 'Explore themes and products currently listed by the official shop.', themes: 'Browse themes', browse: 'Browse products →', back: '← All themes', official: 'Open official website ↗', error: 'Catalogue unavailable. Please try again.', retry: 'Retry', more: 'Load more products', empty: 'No products are publicly listed for this theme.', stale: 'Showing previously fetched data. Check the official shop for current availability.', note: 'Prices are in JPY. Confirm availability, variants and eligibility at the official shop.', quantity: 'Quantity', increase: 'Increase quantity', decrease: 'Decrease quantity', selectionNote: 'Selection on this page only; not added to the official cart.', preview: 'Product preview', checked: 'Fetched', available: 'Available · confirm at shop', ended: 'Sales ended', sold_out: 'Sold out', upcoming: 'Not yet on sale', unknown: 'Check official shop', loaded: 'Products loaded', linkError: 'Unable to open the official website.', end: 'All currently listed products for this theme are shown.' },
  ja: { title: '公式ショップカタログ', intro: '公式ショップで現在公開されているテーマとグッズを探す。', themes: 'テーマ一覧', browse: 'グッズを見る →', back: '← テーマ一覧へ', official: '公式サイトを開く ↗', error: 'カタログを取得できません。', retry: '再試行', more: '続きを読み込む', empty: '現在公開されている商品がありません。', stale: '過去に取得した情報です。最新状況は公式サイトでご確認ください。', note: '価格は日本円です。在庫・仕様・購入資格は公式サイトをご確認ください。', quantity: '数量', increase: '数量を増やす', decrease: '数量を減らす', selectionNote: 'このページ内の選択です。公式カートには追加されません。', preview: '商品プレビュー', checked: '取得日時', available: '販売中・公式で確認', ended: '販売終了', sold_out: '売り切れ', upcoming: '販売開始前', unknown: '公式で確認', loaded: '読み込み済み商品', linkError: '公式サイトを開けませんでした。', end: '公開中の商品をすべて表示しました。' },
};

const wishlistCopy = {
  zh: {
    add: '加入願望清單',
    saving: '儲存中…',
    saved: '已加入願望清單',
    error: '儲存失敗，請重試。',
  },
  en: {
    add: 'Add to wishlist',
    saving: 'Saving…',
    saved: 'Added to wishlist',
    error: 'Unable to save. Please retry.',
  },
  ja: {
    add: 'ウィッシュリストに追加',
    saving: '保存中…',
    saved: 'ウィッシュリストに追加しました',
    error: '保存できませんでした。再試行してください。',
  },
};

export default function ShopScreen() {
  const router = useRouter();
  const requested = useLocalSearchParams<{ theme?: string }>().theme;
  const openedTheme = useRef<string | null>(null);
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const w = copy[language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en'];
  const layout = useWebLayout();
  const { preferences } = usePreferences();
  const [themes, setThemes] = useState<ThemesResponse | null>(null);
  const [selected, setSelected] = useState<ShopTheme | null>(null);
  const [archiveMode, setArchiveMode] = useState(false);
  const [items, setItems] = useState<ShopProduct[]>([]);
  const [meta, setMeta] = useState<ProductsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const columns = archiveMode ? (Platform.OS === 'web' && layout.width >= 1100 ? 3 : 2) : 1;
  const productColumns = Platform.OS === 'web' && layout.width >= 1100 ? 2 : 1;
  const selectedSlug = selected?.slug;
  const now = useCampaignClock([...(themes?.themes.map(t => t.campaign_ends_at) ?? []), selected?.campaign_ends_at, meta?.theme.campaign_ends_at]);
  const effectiveSelected = meta?.theme ?? selected;
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [wishlistMessage, setWishlistMessage] = useState<{
    slug: string;
    ok: boolean;
    limitReached?: boolean;
  } | null>(null);
  const wl = wishlistCopy[
    language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en'
  ];

  useFocusEffect(useCallback(() => {
    let controller: AbortController | null = null;
    let active = true;
    let pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 45000);
      try {
        if (selectedSlug) {
          const entries: ShopProduct[] = [];
          let last: ProductsResponse | null = null;
          for (let currentPage = 1; currentPage <= page; currentPage++) {
            last = await getShopProducts(selectedSlug, currentPage, requestController.signal);
            entries.push(...last.products);
            if (!last.has_more) break;
          }
          if (active && last) {
            setItems([...new Map(entries.map(p => [p.slug, p])).values()]);
            setMeta(last);
          }
        } else {
          const result = await getShopThemes(requestController.signal);
          if (active) {
            setThemes(result);
            if (typeof requested === 'string' && openedTheme.current !== requested) {
              openedTheme.current = requested;
              const theme = result.themes.find(t => t.slug === requested);
              if (theme) { setSelected(theme); setPage(1); setItems([]); setMeta(null); }
            }
          }
        }
        if (active) setError(false);
      } catch { if (active) setError(true); }
      finally { clearTimeout(timeout); pending = false; if (active) setBusy(false); }
    }
    // Revision changes on explicit retry and is part of the refresh lifecycle.
    if (version >= 0) void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); foreground.remove(); controller?.abort(); };
  }, [selectedSlug, page, version, requested]));

  function choose(theme: ShopTheme | null) {
    setSelected(theme); setPage(1); setItems([]); setMeta(null); setError(false); setBusy(true); setFailed([]); setLinkError(false);
  }
  async function saveProductToWishlist(
    product: ShopProduct,
    quantity: number,
    selectedOptions: Record<string, string>,
    upperLimit: number | null,
    productUpperLimit: number | null,
  ) {
    if (!effectiveSelected || !isShopThemeActive(effectiveSelected) || savingSlug !== null) return;

    setSavingSlug(product.slug);
    setWishlistMessage(null);

    try {
      await addToWishlist(
        effectiveSelected,
        product,
        Math.max(1, quantity),
        selectedOptions,
        upperLimit,
        productUpperLimit,
      );
      setWishlistMessage({ slug: product.slug, ok: true });
    } catch (error) {
      const limitReached = error instanceof Error && (
        error.message === 'Official variant purchase limit exceeded' ||
        error.message === 'Official product purchase limit exceeded'
      );
      setWishlistMessage({ slug: product.slug, ok: false, limitReached });
    } finally {
      setSavingSlug(null);
    }
  }

  function retry() { setBusy(true); setError(false); setVersion(v => v + 1); }
  async function open(url: string) {
    setLinkError(false);
    try { await Linking.openURL(url); } catch { setLinkError(true); }
  }
  const info = selected ? meta : themes;
  const checked = info ? new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: preferences.timeZone }).format(new Date(info.checked_at)) : '';
  const currentThemes = themes?.themes.filter(
    theme => isShopThemeActive(theme, now)
  ) ?? [];
  const otherThemes = themes?.themes.filter(
    theme => !isShopThemeActive(theme, now)
  ) ?? [];
  const visibleThemes = archiveMode ? otherThemes : currentThemes;
  const entries = selected ? items : visibleThemes;
  return <SafeAreaView style={s.screen} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
    <RoseScrollView key={selected?.slug ?? 'themes'} contentContainerStyle={[s.content, layout.contentStyle]}>
      <Text style={[s.eyebrow, fanPageHeader.eyebrow]}>ADO FAN HUB</Text><Text style={[s.title, fanPageHeader.title]}>{w.title}</Text><Text style={[s.muted, fanPageHeader.subtitle]}>{w.intro}</Text>
      <View style={s.quickActions}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/wishlist')}
        style={[s.action, s.quickAction]}
      >
        <Text style={s.link}>
          {language.startsWith('zh')
            ? '查看願望清單 →'
            : language.startsWith('ja')
              ? 'ウィッシュリストを見る →'
              : 'View wishlist →'}
        </Text>
      </Pressable>
      {!selected && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setArchiveMode(value => !value)}
          style={[s.action, s.quickAction]}
        >
          <Text style={s.link}>
            {archiveMode
              ? language.startsWith('zh')
                ? '← 返回當期周邊'
                : language.startsWith('ja')
                  ? '← 現在のグッズへ'
                  : '← Current merchandise'
              : language.startsWith('zh')
                ? '瀏覽歷史主題 →'
                : language.startsWith('ja')
                  ? '過去のテーマを見る →'
                  : 'Browse past themes →'}
          </Text>
        </Pressable>
      )}
      </View>
      {selected && <Pressable accessibilityRole="button" onPress={() => choose(null)} style={s.backLink}><Text style={s.link}>{w.back}</Text></Pressable>}
      {!selected && !archiveMode && !busy && !error && currentThemes.length === 0 && (
        <Text style={s.muted}>
          {language.startsWith('zh')
            ? '目前沒有已確認販售中的周邊主題。'
            : language.startsWith('ja')
              ? '現在、販売中と確認できたテーマはありません。'
              : 'No currently verified active campaign.'}
        </Text>
      )}
      {!selected && archiveMode && (
        <Text style={s.muted}>
          {language.startsWith('zh')
            ? '以下為過往或販售期間尚未確認的主題，僅供瀏覽。'
            : language.startsWith('ja')
              ? '過去または販売期間未確認のテーマです。閲覧のみ可能です。'
              : 'Past or unverified campaigns. Browsing only.'}
        </Text>
      )}
      {selected?.image_url && !failed.includes(`theme-${selected.slug}`) && <Image source={{ uri: selected.image_url }} resizeMode="contain" style={s.themeHero}
        onError={() => setFailed(ids => [...ids, `theme-${selected.slug}`])} />}
      {effectiveSelected && (effectiveSelected.campaign_status === 'ended' || (effectiveSelected.campaign_ends_at && now >= Date.parse(effectiveSelected.campaign_ends_at))) && <Text style={s.warning}>{w.ended}</Text>}
      {selected?.visual_kind === 'product_preview' && <Text style={s.small}>{w.preview}</Text>}
      <Text style={s.heading}>{selected?.title ?? (
          archiveMode
            ? language.startsWith('zh') ? '歷史與其他主題'
              : language.startsWith('ja') ? '過去・その他のテーマ'
              : 'Past and other themes'
            : language.startsWith('zh') ? '當期周邊主題'
              : language.startsWith('ja') ? '現在のグッズ'
              : 'Current merchandise'
        )}</Text>
      <Text style={s.muted}>{w.note}</Text>
      {info?.stale && <Text accessibilityRole="alert" style={s.warning}>{w.stale}</Text>}
      {checked !== '' && <Text style={s.small}>{w.checked}: {checked} · {preferences.timeZone}</Text>}
      <View style={s.grid}>
        {selected ? Array.from({ length: Math.ceil(items.length / productColumns) }, (_, row) => (
          <View key={row} style={s.row}>
            {items.slice(row * productColumns, (row + 1) * productColumns).map(entry => {
              return <View key={entry.slug} style={s.productRow}>
                <Pressable accessibilityRole="link" accessibilityLabel={entry.title} onPress={() => void open(entry.url)} style={s.productImageButton}>
                  {entry.image_url && !failed.includes(entry.slug) ? <Image source={{ uri: entry.image_url }} style={s.productImage} resizeMode="contain" onError={() => setFailed(ids => [...ids, entry.slug])} /> : <View style={[s.productImage, s.fallback]}><ExploreIcon name="shop" /></View>}
                </Pressable>
                <View style={s.productDetails}>
                  <Text style={s.productTitle}>{entry.title}</Text>
                  <Text style={s.price}>{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(entry.price_jpy)}</Text>
                  <Text style={s.badge}>{w[entry.status]}</Text>
                  {entry.labels.map(label => <Text key={label} style={s.small}>{label}</Text>)}
                  {effectiveSelected && isShopThemeActive(effectiveSelected, now) &&
                    (entry.status === 'available' || entry.status === 'sold_out') && (
                  <ShopProductPicker
                    product={entry}
                    language={language}
                    disabled={savingSlug !== null}
                    onAdd={(quantity, selectedOptions, upperLimit, productUpperLimit) =>
                      saveProductToWishlist(
                        entry,
                        quantity,
                        selectedOptions,
                        upperLimit,
                        productUpperLimit,
                      )
                    }
                  />
                  )}
                  {wishlistMessage?.slug === entry.slug && (
                    <Text accessibilityRole="alert" style={s.small}>
                      {wishlistMessage.ok
                        ? wl.saved
                        : wishlistMessage.limitReached
                          ? language.startsWith('zh')
                            ? '已達官方限購上限，無法再增加數量。'
                            : language.startsWith('ja')
                              ? '公式の購入上限に達しました。'
                              : 'Official purchase limit reached.'
                          : wl.error}
                    </Text>
                  )}
                  <Pressable accessibilityRole="link" onPress={() => void open(entry.url)} style={s.productLink}><Text style={s.link}>{w.official}</Text></Pressable>
                </View>
              </View>;
            })}
            {items.slice(row * productColumns, (row + 1) * productColumns).length < productColumns && <View style={s.spacer} />}
          </View>
        )) : Array.from({ length: Math.ceil(entries.length / columns) }, (_, row) => <View key={row} style={s.row}>
          {visibleThemes.slice(row * columns, (row + 1) * columns).map(entry => (
            <Pressable accessibilityRole="button" key={entry.slug} onPress={() => choose(entry)} style={({ pressed }) => [
              s.themeTile,
              !archiveMode && s.currentThemeTile,
              pressed && s.pressed,
            ]}>
              {entry.image_url && !failed.includes(`theme-${entry.slug}`) ? <Image source={{ uri: entry.image_url }} resizeMode="contain" style={[s.themeImage, !archiveMode && s.currentThemeImage]}
                onError={() => setFailed(ids => [...ids, `theme-${entry.slug}`])} /> : <View style={[s.themeImage, !archiveMode && s.currentThemeImage, s.fallback]}><ExploreIcon name="shop" /></View>}
              {entry.visual_kind === 'product_preview' && <Text style={s.small}>{w.preview}</Text>}
              <Text style={s.productTitle}>{entry.title}</Text><Text style={s.link}>{w.browse}</Text>
            </Pressable>
          ))}
          {entries.slice(row * columns, (row + 1) * columns).length < columns && Array.from({ length: columns - entries.slice(row * columns, (row + 1) * columns).length }, (_, i) => <View key={`space-${i}`} style={s.spacer} />)}
        </View>)}
      </View>
      {busy && <ActivityIndicator color={C.accent} />}
      {error && <View style={s.error}><Text accessibilityRole="alert" style={s.muted}>{w.error}</Text><Pressable accessibilityRole="button" onPress={retry} style={s.action}><Text style={s.link}>{w.retry}</Text></Pressable></View>}
      {selected && !busy && !error && items.length === 0 && <Text style={s.muted}>{w.empty}</Text>}
      {selected && meta && <Text style={s.small}>{w.loaded}: {items.length} / {meta.total}</Text>}
      {selected && meta?.has_more && !error && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setBusy(true); setError(false); setPage(p => p + 1); }} style={s.action}><Text style={s.link}>{w.more}</Text></Pressable>}
      {selected && meta && !meta.has_more && !busy && !error && items.length > 0 && <Text style={s.small}>{w.end}</Text>}
      {!selected && !archiveMode && <SoldOutProducts language={language} />}
      <Pressable accessibilityRole="link" onPress={() => void open(selected?.url ?? 'https://ado-officialshop-friedpotato.com/')} style={s.action}><Text style={s.link}>{w.official}</Text></Pressable>
      {linkError && <Text accessibilityRole="alert" style={s.muted}>{w.linkError}</Text>}
    </RoseScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  themeTile: { flex: 1, minWidth: 0, gap: 10, paddingBottom: 12 },
  currentThemeTile: {
    width: '100%', flex: 1, backgroundColor: C.surface,
    padding: 14, borderRadius: 14, gap: 12,
  },
  themeImage: { width: '100%', aspectRatio: 1, borderRadius: 8 },
  currentThemeImage: {
    width: '100%', aspectRatio: 16 / 9,
    backgroundColor: C.surfaceAlt, borderRadius: 8,
  },
  themeHero: { width: '100%', aspectRatio: 16 / 9, maxHeight: 320, borderRadius: 12 },
  productRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: C.border },
  productImageButton: { width: '48%', maxWidth: 260 },
  productImage: { width: '100%', aspectRatio: 1, backgroundColor: '#fff', borderRadius: 4 },
  productDetails: { flex: 1, minWidth: 0, gap: 8 },
  quantityRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  quantityButton: { width: 44, height: 44, borderRadius: 8, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  quantityText: { color: C.accent, fontSize: 22 }, quantityValue: { minWidth: 22, color: C.text, fontSize: 15, textAlign: 'center' },
  disabled: { opacity: 0.35 }, productLink: { paddingVertical: 10 },
  screen: { flex: 1, backgroundColor: C.background },
  content: {
    width: '100%', maxWidth: Platform.OS === 'web' ? 1280 : 850,
    alignSelf: 'center', padding: Platform.OS === 'web' ? 24 : 16,
    paddingTop: Platform.OS === 'web' ? 100 : 8,
    paddingBottom: 110, gap: 10,
  },
  title: { color: C.text, fontSize: 28, fontWeight: '800' }, heading: { color: C.text, fontSize: 20, fontWeight: '700' }, eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 14, lineHeight: 23 }, small: { color: C.muted, fontSize: 11, lineHeight: 17 }, link: { color: C.accent, fontSize: 12, fontWeight: '600' }, warning: { color: '#edc989', fontSize: 14, lineHeight: 23 },
  grid: { gap: 10 }, row: { flexDirection: 'row', gap: 10 },
  spacer: { flex: 1 }, fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceAlt },
  productTitle: { color: C.text, fontSize: 14, lineHeight: 22, fontWeight: '600' }, price: { color: C.text, fontSize: 18, fontWeight: '700' }, badge: { color: C.accent, fontSize: 11, lineHeight: 18 },
  action: {
    padding: 10, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.border,
    borderRadius: 12, alignSelf: 'flex-start',
  },
  quickActions: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  quickAction: { flex: 1, alignSelf: 'stretch', justifyContent: 'center' },
  backLink: { paddingVertical: 8, alignSelf: 'flex-start' },
  error: { gap: 12 }, pressed: { opacity: 0.75 },
});
