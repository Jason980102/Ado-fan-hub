import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, AppState, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { FanColors as C } from '@/constants/fan-theme';
import { getSoldOutProducts, type SoldOutEntry } from '@/services/shop-api';
import { loadRestockSubscriptions, setRestockSubscription, type RestockSubscription } from '@/services/restock';

const copy = {
  zh: { title: '當期售罄商品', empty: '目前沒有已確認售罄的當期商品。',
    ask: '如果有貨的時候是否通知', on: '已開啟 · 點此關閉', off: '開啟補貨通知',
    note: '商品任一規格恢復供貨時提醒一次；不保證指定尺寸或規格仍有庫存。',
    error: '無法載入售罄商品，請重試。', retry: '重試', more: '載入更多售罄商品',
    stale: '目前為先前取得的商品資料，請以官方網站為準。',
    settings: '無法確認通知設定，請重試。', success: '已設定補貨通知。', cancelled: '已關閉補貨通知。',
    push_not_configured: '補貨推播尚未開放，請稍後再試。',
    push_unsupported: '請使用 Android 或 iOS App 開啟補貨通知。',
    push_development_build: '目前版本尚不支援遠端推播，請使用正式或測試安裝版。',
    push_permission_denied: '尚未允許通知，請至裝置設定開啟通知權限。',
    push_product_changed: '商品或活動狀態已變更，請重新載入。',
    failed: '通知設定未儲存成功，請稍後重試。' },
  en: { title: 'Sold-out current merchandise', empty: 'No current products are confirmed sold out.',
    ask: 'Notify me when available', on: 'Enabled · tap to turn off', off: 'Enable restock alert',
    note: 'One alert when any variant becomes available. Your preferred size or option may still be unavailable.',
    error: 'Unable to load sold-out products.', retry: 'Retry', more: 'Load more sold-out products',
    stale: 'Showing earlier stock data. Confirm availability at the official shop.',
    settings: 'Unable to confirm notification settings. Please retry.', success: 'Restock alert enabled.', cancelled: 'Restock alert disabled.',
    push_not_configured: 'Restock notifications are not available yet. Please try again later.',
    push_unsupported: 'Use the Android or iOS app to enable restock alerts.',
    push_development_build: 'Use an installed release or development build for push notifications.',
    push_permission_denied: 'Allow notifications in your device settings.',
    push_product_changed: 'Product or campaign status changed. Please reload.',
    failed: 'Notification settings were not saved. Please retry later.' },
  ja: { title: '現在の売り切れグッズ', empty: '現在、売り切れと確認されたグッズはありません。',
    ask: '再入荷時に通知しますか', on: '通知オン・タップでオフ', off: '再入荷通知をオン',
    note: 'いずれかの仕様が再入荷した際に1回通知します。希望サイズ・仕様の在庫は保証されません。',
    error: '売り切れ商品を取得できません。', retry: '再試行', more: 'さらに表示',
    stale: '過去の在庫情報です。最新情報は公式サイトをご確認ください。',
    settings: '通知設定を確認できません。再試行してください。', success: '再入荷通知を設定しました。', cancelled: '再入荷通知をオフにしました。',
    push_not_configured: '再入荷通知は準備中です。後ほどお試しください。',
    push_unsupported: 'AndroidまたはiOSアプリをご利用ください。',
    push_development_build: 'プッシュ通知はインストール版でご利用ください。',
    push_permission_denied: '端末の設定で通知を許可してください。',
    push_product_changed: '商品または販売期間が変更されました。再読み込みしてください。',
    failed: '通知設定を保存できません。後ほど再試行してください。' },
};

export default function SoldOutProducts({ language }: { language: string }) {
  const t = copy[language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en'];
  const [items, setItems] = useState<SoldOutEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<RestockSubscription[]>([]);
  const [pages, setPages] = useState(1);
  const [revision, setRevision] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const settingsVersion = useRef(0);
  const alive = useRef(false);
  const savingRef = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    alive.current = true;
    let controller: AbortController | null = null;
    async function refresh() {
      if (pending) return;
      pending = true;
      const requestController = new AbortController();
      controller = requestController;
      const timeout = setTimeout(() => requestController.abort(), 45000);
      setLoading(true);
      const version = settingsVersion.current;
      const settings = loadRestockSubscriptions(requestController.signal).then(result => {
        if (active && version === settingsVersion.current) setSubscriptions(result);
      }).catch(() => { if (active) setMessage(t.settings); });
      try {
        const entries: SoldOutEntry[] = [];
        let more = false;
        let old = false;
        for (let page = 1; page <= pages; page++) {
          const result = await getSoldOutProducts(page, requestController.signal);
          entries.push(...result.items);
          more = result.has_more;
          old ||= result.stale;
          if (!more) break;
        }
        if (active) {
          setItems([...new Map(entries.map(e => [`${e.theme.slug}/${e.product.slug}`, e])).values()]);
          setHasMore(more); setStale(old); setError(false);
        }
      } catch { if (active) setError(true); }
      finally { await settings; clearTimeout(timeout); pending = false; if (active) setLoading(false); }
    }
    if (revision >= 0) void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; alive.current = false; clearInterval(timer); foreground.remove(); controller?.abort(); };
  }, [pages, revision, t.settings]));

  async function toggle(entry: SoldOutEntry, enabled: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    const key = `${entry.theme.slug}/${entry.product.slug}`;
    settingsVersion.current++;
    setSaving(key); setMessage('');
    try {
      await setRestockSubscription(entry.theme.slug, entry.product.slug, enabled, language);
      if (!alive.current) return;
      setSubscriptions(previous => enabled
        ? [...previous.filter(s => s.themeSlug !== entry.theme.slug || s.productSlug !== entry.product.slug),
          { themeSlug: entry.theme.slug, productSlug: entry.product.slug }]
        : previous.filter(s => s.themeSlug !== entry.theme.slug || s.productSlug !== entry.product.slug));
      setMessage(enabled ? t.success : t.cancelled);
    } catch (failure) {
      if (!alive.current) return;
      const code = failure instanceof Error ? failure.message : '';
      setMessage(code in t ? t[code as keyof typeof t] : t.failed);
    } finally {
      settingsVersion.current++;
      savingRef.current = false;
      if (alive.current) setSaving(null);
    }
  }

  return <View style={s.section} testID="sold-out-section">
    <Text style={s.heading}>{t.title}</Text>
    <Text style={s.note}>{t.note}</Text>
    {loading && <ActivityIndicator color={C.accent} />}
    {error && <Text accessibilityRole="alert" style={s.note}>{t.error}</Text>}
    {stale && <Text accessibilityRole="alert" style={s.note}>{t.stale}</Text>}
    {message !== '' && <Text accessibilityRole="alert" style={s.note}>{message}</Text>}
    {error && <Pressable accessibilityRole="button" onPress={() => setRevision(v => v + 1)} style={s.button}><Text style={s.link}>{t.retry}</Text></Pressable>}
    {!loading && !error && items.length === 0 && <Text style={s.note}>{t.empty}</Text>}
    {items.map(entry => {
      const subscribed = subscriptions.some(s => s.themeSlug === entry.theme.slug && s.productSlug === entry.product.slug);
      const key = `${entry.theme.slug}/${entry.product.slug}`;
      return <View key={key} style={s.row}>
        {entry.product.image_url && <Image source={{ uri: entry.product.image_url }} resizeMode="contain" style={s.image} />}
        <View style={s.details}>
          <Text style={s.note}>{entry.theme.title}</Text>
          <Text style={s.title}>{entry.product.title}</Text>
          <Text style={s.note}>{new Intl.NumberFormat(language, { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(entry.product.price_jpy)}</Text>
          <Text style={s.title}>{t.ask}</Text>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: subscribed, disabled: saving !== null || (stale && !subscribed) }}
            accessibilityLabel={t.ask} disabled={saving !== null || (stale && !subscribed)} onPress={() => void toggle(entry, !subscribed)}
            style={[s.button, subscribed && s.enabled]}>
            <Text style={s.link}>{saving === key ? '…' : subscribed ? t.on : t.off}</Text>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(entry.product.url).catch(() => setMessage(t.error))}>
            <Text style={s.link}>{language.startsWith('zh') ? '查看官方商品 ↗' : language.startsWith('ja') ? '公式商品を見る ↗' : 'View official product ↗'}</Text>
          </Pressable>
        </View>
      </View>;
    })}
    {hasMore && <Pressable accessibilityRole="button" disabled={loading} onPress={() => setPages(p => p + 1)} style={s.button}><Text style={s.link}>{t.more}</Text></Pressable>}
  </View>;
}

const s = StyleSheet.create({
  section: { gap: 12, paddingTop: 16 },
  heading: { fontSize: 20, fontWeight: '700', color: C.text },
  note: { color: C.muted, fontSize: 12, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  image: { width: 82, height: 100, backgroundColor: '#fff', borderRadius: 4 },
  details: { flex: 1, minWidth: 0, gap: 8 },
  title: { color: C.text, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  button: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: C.surfaceAlt },
  enabled: { borderColor: C.accent, borderWidth: 1 },
  link: { color: C.accent, fontSize: 12, lineHeight: 19, fontWeight: '600' },
});
