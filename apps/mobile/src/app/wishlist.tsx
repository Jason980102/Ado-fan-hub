import { useCampaignClock } from '@/hooks/use-campaign-clock';
import { fanPageHeader } from '@/constants/fan-page-header';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import RoseScrollView from '@/components/rose-scroll-view';
import WishlistBudget from '@/components/wishlist-budget';
import { FanColors as C } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import {
  loadWishlist,
  refreshWishlistCampaigns,
  getWishlistCampaignStatus,
  getWishlistQuantityMax,
  updateWishlistQuantity,
  removeFromWishlist,
  type WishlistItem,
} from '@/services/wishlist';

const copy = {
  zh: {
    title: '我的願望清單',
    subtitle: '規劃想購買的 Ado 官方商品。',
    empty: '還沒有加入任何商品。',
    browse: '前往商品目錄',
    quantity: '數量',
    purchaseLimit: '官方限購',
    productLimit: '商品總限購（各尺寸合計）',
    limitReached: '已達官方限購上限，無法增加數量。',
    remove: '移除',
    subtotal: '商品小計',
    note: '這不是官方購物車。價格為儲存時的參考價格，不含運費及稅金，請以官方網站為準。',
    error: '願望清單操作失敗，請重試。',
    retry: '重新載入',
  },
  en: {
    title: 'My Wishlist',
    subtitle: 'Plan your Ado merchandise purchases.',
    empty: 'Your wishlist is empty.',
    browse: 'Browse merchandise',
    quantity: 'Quantity',
    purchaseLimit: 'Official purchase limit',
    productLimit: 'Product limit (all sizes combined)',
    limitReached: 'Official purchase limit reached. Quantity cannot be increased.',
    remove: 'Remove',
    subtotal: 'Merchandise subtotal',
    note: 'This is not an official shopping cart. Saved prices are estimates excluding shipping and taxes. Confirm prices at the official shop.',
    error: 'Unable to update your wishlist.',
    retry: 'Reload',
  },
  ja: {
    title: 'ウィッシュリスト',
    subtitle: '購入したいAdo公式グッズを管理できます。',
    empty: 'まだ商品が登録されていません。',
    browse: 'グッズを見る',
    quantity: '数量',
    purchaseLimit: '公式購入上限',
    productLimit: '商品全体の購入上限（全サイズ合計）',
    limitReached: '公式の購入上限に達したため、数量を増やせません。',
    remove: '削除',
    subtotal: '商品小計',
    note: '公式カートではありません。保存時の参考価格で、送料・税金は含まれません。最新価格は公式サイトをご確認ください。',
    error: 'ウィッシュリストを更新できませんでした。',
    retry: '再読み込み',
  },
};

const yen = (value: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value);

export default function WishlistScreen() {
  const router = useRouter();
  const { i18n } = useTranslation();
  const layout = useWebLayout();

  const language = i18n.resolvedLanguage || i18n.language;
  const w = copy[
    language.startsWith('zh') ? 'zh'
      : language.startsWith('ja') ? 'ja' : 'en'
  ];

  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const busyRef = useRef(false);
  const now = useCampaignClock(items.map(item => item.campaignEndsAt));

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let pending = false;
      let controller: AbortController | null = null;
      // Retry changes the callback, while keeping local data visible on refresh.
      const retryRevision = reload;
      async function refresh() {
        if (pending) return;
        pending = true;
        const requestController = new AbortController();
        controller = requestController;
        const timeout = setTimeout(() => requestController.abort(), 15000);
        try {
          const local = await loadWishlist();
          if (active && !busyRef.current) setItems(local);
          const updated = await refreshWishlistCampaigns(requestController.signal);
          if (active && !busyRef.current) { setItems(updated); setError(false); }
        } catch { if (active) setError(true); }
        finally { clearTimeout(timeout); pending = false; if (active) setLoading(false); }
      }
      if (retryRevision >= 0) void refresh();
      const timer = setInterval(() => void refresh(), 60000);
      const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
      return () => { active = false; clearInterval(timer); subscription.remove(); controller?.abort(); };
    }, [reload])
  );

  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  async function change(action: () => Promise<WishlistItem[]>) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(false);
    setLimitNotice(null);

    try {
      const updated = await action();
      setItems(updated);
    } catch (error) {
      const purchaseLimitReached =
        error instanceof Error &&
        (
          error.message === 'Official variant purchase limit exceeded' ||
          error.message === 'Official product purchase limit exceeded'
        );

      if (purchaseLimitReached) {
        setLimitNotice(w.limitReached);
      } else {
        setError(true);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }


  return (
    <SafeAreaView
      style={styles.screen}
      edges={['left', 'right']}
    >
      <RoseScrollView
        contentContainerStyle={[
          styles.content,
          layout.contentStyle,
        ]}
      >
        <Text style={[styles.eyebrow, fanPageHeader.eyebrow]}>ADO FAN HUB</Text>
        <Text style={[styles.title, fanPageHeader.title]}>{w.title}</Text>
        <Text style={[styles.muted, fanPageHeader.subtitle]}>{w.subtitle}</Text>

        {limitNotice && (
          <Text accessibilityRole="alert" style={styles.muted}>
            {limitNotice}
          </Text>
        )}

        {loading && <ActivityIndicator color={C.accent} />}

        {error && (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.muted}>
              {w.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReload(value => value + 1)}
              style={styles.button}
            >
              <Text style={styles.accent}>{w.retry}</Text>
            </Pressable>
          </View>
        )}

        {!loading && items.length === 0 && !error && (
          <View style={styles.card}>
            <Text style={styles.muted}>{w.empty}</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => router.push('/shop')}
            >
              <Text style={styles.accent}>{w.browse} →</Text>
            </Pressable>
          </View>
        )}

        {!loading && items.map(item => (
          <View key={item.id} style={styles.card}>
            <View style={styles.product}>
              {item.imageUrl ? (
                <Image
                  source={{ uri: item.imageUrl }}
                  resizeMode="contain"
                  style={styles.image}
                />
              ) : (
                <View style={[styles.image, styles.fallback]} />
              )}

              <View style={styles.details}>
                <Text style={styles.name}>{item.title}</Text>
                <Text style={styles.price}>{yen(item.priceJpy)}</Text>
                <Text style={styles.saleStatus}>
                  {getWishlistCampaignStatus(item, now) === 'ended'
                    ? language.startsWith('zh') ? '販售結束' : language.startsWith('ja') ? '販売終了' : 'Sales ended'
                    : getWishlistCampaignStatus(item, now) === 'active'
                      ? language.startsWith('zh') ? '販售中' : language.startsWith('ja') ? '販売中' : 'On sale'
                      : language.startsWith('zh') ? '販售狀態待確認' : language.startsWith('ja') ? '販売状況未確認' : 'Sale status unverified'}
                </Text>


                {Object.entries(item.selectedOptions).map(
                  ([key, value]) => (
                    <Text key={key} style={styles.muted}>
                      {key}: {value}
                    </Text>
                  )
                )}

                <Text style={styles.muted}>{w.quantity}</Text>

                {typeof item.officialProductUpperLimit === 'number' ? (
                  <Text style={styles.muted}>
                    {w.productLimit}: {item.officialProductUpperLimit}
                  </Text>
                ) : typeof item.officialUpperLimit === 'number' ? (
                  <Text style={styles.muted}>
                    {w.purchaseLimit}: {item.officialUpperLimit}
                  </Text>
                ) : null}

                <View style={styles.controls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="-"
                    disabled={busy || getWishlistCampaignStatus(item, now) === 'ended' || item.quantity <= 1}
                    onPress={() => void change(() =>
                      updateWishlistQuantity(
                        item.id,
                        item.quantity - 1
                      )
                    )}
                    style={styles.quantityButton}
                  >
                    <Text style={styles.accent}>−</Text>
                  </Pressable>

                  <Text style={styles.quantity}>{item.quantity}</Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="+"
                    disabled={busy || getWishlistCampaignStatus(item, now) === 'ended' || item.quantity >= getWishlistQuantityMax(items, item)}
                    onPress={() => void change(() =>
                      updateWishlistQuantity(
                        item.id,
                        item.quantity + 1
                      )
                    )}
                    style={[
                      styles.quantityButton,
                      (busy || item.quantity >= getWishlistQuantityMax(items, item))
                        && styles.quantityDisabled,
                    ]}
                  >
                    <Text style={styles.accent}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.price}>
                {yen(item.priceJpy * item.quantity)}
              </Text>

              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void change(() =>
                  removeFromWishlist(item.id)
                )}
                style={styles.button}
              >
                <Text style={styles.accent}>{w.remove}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        {!loading && items.length > 0 && (
          <WishlistBudget items={items} />
        )}

        {!loading && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/shop')}
            style={styles.button}
          >
            <Text style={styles.accent}>{w.browse} →</Text>
          </Pressable>
        )}

        <Text style={styles.muted}>{w.note}</Text>
      </RoseScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 105 : 8,
    paddingBottom: 110,
    gap: 18,
  },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700' },
  title: { color: C.text, fontSize: 28, fontWeight: '800' },
  saleStatus: { color: C.accent, fontSize: 13, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 13, lineHeight: 21 },
  accent: { color: C.accent, fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: C.surface,
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  product: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  image: {
    width: 100,
    height: 100,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  fallback: { backgroundColor: C.surfaceAlt },
  details: { flex: 1, minWidth: 0, gap: 8 },
  name: { color: C.text, fontSize: 15, fontWeight: '700' },
  price: { color: C.text, fontSize: 17, fontWeight: '700' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  quantityButton: {
    backgroundColor: C.surfaceAlt,
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityDisabled: { opacity: 0.35 },
  quantity: { color: C.text, fontSize: 16, minWidth: 24, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  summary: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: C.surfaceAlt,
    gap: 8,
  },
  total: { color: C.accent, fontSize: 26, fontWeight: '800' },
});
