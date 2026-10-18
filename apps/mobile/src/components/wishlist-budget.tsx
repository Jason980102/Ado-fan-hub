import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { FanColors as C } from '@/constants/fan-theme';
import {
  calculateBudgetEstimate,
  formatBudgetAmount,
  type BudgetCurrency,
  type FxSnapshot,
} from '@/services/budget';
import { getBudgetRates } from '@/services/budget-cache';
import {
  calculateWishlistSubtotal,
  type WishlistItem,
} from '@/services/wishlist';

type Props = {
  items: WishlistItem[];
};

const currencies: BudgetCurrency[] = ['JPY', 'USD', 'TWD'];
const PREFS_KEY = '@ado-fan-hub/wishlist-budget-prefs/v1';

const copy = {
  zh: {
    title: '購物預算試算',
    subtitle: '將願望清單換算成你熟悉的貨幣。',
    currency: '顯示貨幣',
    subtotal: '商品小計',
    shipping: '預估運費（JPY）',
    total: '預估總額',
    loading: '正在取得參考匯率…',
    unavailable: '目前無法取得參考匯率。',
    retry: '重新取得匯率',
    invalid: '請輸入 0 至 1,000,000,000 的有效運費。',
    source: '匯率來源',
    note: '僅供預算參考。未包含可能產生的關稅、稅金、手續費及實際結帳匯差。',
  },
  en: {
    title: 'Shopping Budget',
    subtitle: 'Estimate your wishlist in your preferred currency.',
    currency: 'Display currency',
    subtotal: 'Merchandise subtotal',
    shipping: 'Estimated shipping (JPY)',
    total: 'Estimated total',
    loading: 'Loading reference exchange rates…',
    unavailable: 'Reference exchange rates are unavailable.',
    retry: 'Retry exchange rates',
    invalid: 'Enter valid shipping from 0 to 1,000,000,000.',
    source: 'Exchange rate source',
    note: 'For budgeting only. Excludes potential duties, taxes, processing fees, and checkout exchange rate differences.',
  },
  ja: {
    title: '購入予算シミュレーター',
    subtitle: 'ウィッシュリストの合計額を通貨換算できます。',
    currency: '表示通貨',
    subtotal: '商品小計',
    shipping: '送料の目安（JPY）',
    total: '予想合計額',
    loading: '参考為替レートを取得中…',
    unavailable: '参考為替レートを取得できません。',
    retry: '為替レートを再取得',
    invalid: '送料は0〜1,000,000,000の範囲で入力してください。',
    source: '為替レート提供元',
    note: '予算の目安です。関税、税金、手数料、実際の決済時の為替差は含みません。',
  },
};

export default function WishlistBudget({ items }: Props) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const locale = language.startsWith('zh') ? 'zh-TW'
    : language.startsWith('ja') ? 'ja-JP' : 'en-US';
  const w = copy[language.startsWith('zh') ? 'zh'
    : language.startsWith('ja') ? 'ja' : 'en'];

  const [currency, setCurrency] = useState<BudgetCurrency>('JPY');
  const [shippingInput, setShippingInput] = useState('0');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [fx, setFx] = useState<FxSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateError, setRateError] = useState(false);
  const [stale, setStale] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(PREFS_KEY)
      .then(raw => {
        if (!active || !raw) return;

        const saved: unknown = JSON.parse(raw);
        if (!saved || typeof saved !== 'object') return;

        const prefs = saved as Record<string, unknown>;

        if (
          prefs.currency === 'JPY' ||
          prefs.currency === 'USD' ||
          prefs.currency === 'TWD'
        ) {
          setCurrency(prefs.currency);
        }

        if (
          typeof prefs.shippingInput === 'string' &&
          /^\d{0,11}$/.test(prefs.shippingInput) &&
          Number(prefs.shippingInput) <= 1_000_000_000
        ) {
          setShippingInput(prefs.shippingInput);
        }
      })
      .catch(error => {
        console.warn('Could not load budget preferences:', error);
      })
      .finally(() => {
        if (active) setPreferencesReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;

    void AsyncStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ currency, shippingInput }),
    ).catch(error => {
      console.warn('Could not save budget preferences:', error);
    });
  }, [currency, shippingInput, preferencesReady]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let pending = false;
      const controller = new AbortController();

      async function refresh(force = false) {
        if (pending || !active) return;
        pending = true;
        setLoading(true);
        setRateError(false);
        try {
          const { snapshot, stale: isStale } = await getBudgetRates(controller.signal, force);
          if (active) { setFx(snapshot); setStale(isStale); }
        } catch {
          if (active) { setFx(null); setStale(false); setRateError(true); }
        } finally {
          pending = false;
          if (active) setLoading(false);
        }
      }

      void refresh(reload > 0);
      const timer = setInterval(() => {
        if (AppState.currentState === 'active' || Platform.OS === 'web') void refresh();
      }, 60000);
      const subscription = AppState.addEventListener('change', state => {
        if (state === 'active') void refresh();
      });
      const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
      if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);

      return () => {
        active = false;
        clearInterval(timer);
        subscription.remove();
        if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onVisible);
        controller.abort();
      };
    }, [reload])
  );

  const shipping = Number(shippingInput || '0');
  const shippingValid = Number.isFinite(shipping)
    && shipping >= 0
    && shipping <= 1_000_000_000;

  const subtotal = calculateWishlistSubtotal(items);
  const totalJpy = subtotal + (shippingValid ? shipping : 0);

  const estimate = fx && shippingValid
    ? calculateBudgetEstimate(items, shipping, currency, fx)
    : null;

  const total = currency === 'JPY'
    ? formatBudgetAmount(totalJpy, 'JPY', locale)
    : estimate
      ? formatBudgetAmount(estimate.convertedTotal, currency, locale)
      : null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{w.title}</Text>
      <Text style={styles.muted}>{w.subtitle}</Text>

      <Text style={styles.label}>{w.currency}</Text>
      <View style={styles.currencies}>
        {currencies.map(option => (
          <Pressable
            key={option}
            disabled={!preferencesReady}
            accessibilityRole="button"
            accessibilityState={{ selected: currency === option }}
            onPress={() => setCurrency(option)}
            style={[
              styles.currencyButton,
              currency === option && styles.selected,
            ]}
          >
            <Text style={styles.currencyText}>{option}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.line}>
        <Text style={styles.muted}>{w.subtotal}</Text>
        <Text style={styles.amount}>
          {formatBudgetAmount(subtotal, 'JPY', locale)}
        </Text>
      </View>

      <Text style={styles.label}>{w.shipping}</Text>
      <TextInput
        value={shippingInput}
        editable={preferencesReady}
        onChangeText={value => {
          setShippingInput(value.replace(/[^0-9]/g, '').slice(0, 11));
        }}
        keyboardType="number-pad"
        accessibilityLabel={w.shipping}
        placeholder="0"
        placeholderTextColor={C.muted}
        style={styles.input}
      />

      {!shippingValid && (
        <Text accessibilityRole="alert" style={styles.error}>
          {w.invalid}
        </Text>
      )}

      <View style={styles.totalArea}>
        <Text style={styles.muted}>{w.total}</Text>
        <Text style={styles.total}>
          {shippingValid ? total ?? '—' : '—'}
        </Text>
        {currency !== 'JPY' && (
          <Text style={styles.muted}>
            {formatBudgetAmount(totalJpy, 'JPY', locale)}
          </Text>
        )}
      </View>

      {loading && (
        <View style={styles.status}>
          <ActivityIndicator color={C.accent} size="small" />
          <Text style={styles.muted}>{w.loading}</Text>
        </View>
      )}

      {!loading && rateError && (
        <View style={styles.status}>
          <Text style={styles.error}>{w.unavailable}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => setReload(value => value + 1)}
          >
            <Text style={styles.accent}>{w.retry}</Text>
          </Pressable>
        </View>
      )}

      {fx && !loading && !rateError && (
        <View style={styles.rateInfo}>
          <Text style={styles.muted}>
            {w.source}: {fx.source}
          </Text>
          <Text style={styles.muted}>
            USD: {fx.dates.USD} · TWD: {fx.dates.TWD}
          </Text>
          <Text style={styles.muted}>
            {language.startsWith('zh') ? '最後成功檢查' : language.startsWith('ja') ? '最終確認' : 'Last successful check'}:
            {' '}{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(fx.checkedAt))}
          </Text>
          {fx.awaitingPublication && (
            <Text style={styles.muted}>
              {language.startsWith('zh')
                ? '目前使用來源最新已發布匯率；資料日期早於今日（UTC），系統會持續檢查更新。'
                : language.startsWith('ja')
                  ? '公表済みの最新レートです。日付は本日（UTC）より前のため、更新を定期確認します。'
                  : 'Using the latest published rates. Their date precedes today (UTC); updates are checked regularly.'}
            </Text>
          )}


          {stale && (
            <>
              <Text accessibilityRole="alert" style={styles.error}>
                {language.startsWith('zh')
                  ? '\u4f7f\u7528\u5feb\u53d6\u532f\u7387\uff0c\u8cc7\u6599\u53ef\u80fd\u4e0d\u662f\u6700\u65b0\u3002'
                  : language.startsWith('ja')
                    ? '\u4fdd\u5b58\u6e08\u307f\u306e\u70ba\u66ff\u30ec\u30fc\u30c8\u3067\u3059\u3002\u6700\u65b0\u3067\u306f\u306a\u3044\u53ef\u80fd\u6027\u304c\u3042\u308a\u307e\u3059\u3002'
                    : 'Saved exchange rates may be out of date.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                style={styles.retryButton}
                onPress={() => setReload(value => value + 1)}
              >
                <Text style={styles.accent}>{w.retry}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      <Text style={styles.muted}>{w.note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 20,
    gap: 14,
  },
  title: {
    color: C.text,
    fontSize: 20,
    fontWeight: '800',
  },
  muted: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  label: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  currencies: {
    flexDirection: 'row',
    gap: 10,
  },
  currencyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
  },
  selected: {
    borderColor: C.accent,
    backgroundColor: C.selected,
  },
  currencyText: {
    color: C.text,
    fontWeight: '700',
  },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  amount: {
    color: C.text,
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    backgroundColor: C.surfaceAlt,
    color: C.text,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  totalArea: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: C.surfaceAlt,
    gap: 8,
  },
  total: {
    color: C.accent,
    fontSize: 28,
    fontWeight: '800',
  },
  status: {
    gap: 10,
  },
  retryButton: {
    alignSelf: 'flex-start',
    padding: 10,
    borderRadius: 8,
    backgroundColor: C.surfaceAlt,
  },
  accent: {
    color: C.accent,
    fontWeight: '600',
  },
  error: {
    color: '#F0A0A0',
    fontSize: 13,
  },
  rateInfo: {
    gap: 4,
  },
});
