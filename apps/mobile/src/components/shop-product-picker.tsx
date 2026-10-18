import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { FanColors as C } from '@/constants/fan-theme';
import {
  getShopProductOptions,
  getShopVariation,
  type ShopOptionsResponse,
  type ShopProduct,
  type ShopVariationResponse,
} from '@/services/shop-api';

type Props = {
  product: ShopProduct;
  language: string;
  disabled?: boolean;
  onAdd: (
    quantity: number,
    selectedOptions: Record<string, string>,
    upperLimit: number | null,
    productUpperLimit: number | null,
  ) => Promise<void>;
};

const translations = {
  zh: {
    open: '選擇規格／加入願望清單',
    close: '收起規格',
    loading: '正在取得官方規格…',
    error: '無法取得官方規格，請重試。',
    retry: '重新載入',
    quantity: '件數',
    limit: '官方限購',
    unknown: '官方限購數量未知；99 為願望清單的規劃上限。',
    unavailable: '此規格組合不可用。',
    outOfStock: '此規格目前缺貨，仍可加入願望清單。',
    checking: '正在確認規格資料…',
    variationError: '無法確認此規格的限購數量。',
    add: '加入願望清單',
    saving: '儲存中…',
  },
  en: {
    open: 'Select options / Add to wishlist',
    close: 'Close options',
    loading: 'Loading official options...',
    error: 'Unable to load official options.',
    retry: 'Retry',
    quantity: 'Quantity',
    limit: 'Official purchase limit',
    unknown: 'Official limit unknown; 99 is only the wishlist planning cap.',
    unavailable: 'This option combination is unavailable.',
    outOfStock: 'This variant is out of stock but can be wishlisted.',
    checking: 'Checking selected variant...',
    variationError: 'Unable to confirm this variant limit.',
    add: 'Add to wishlist',
    saving: 'Saving...',
  },
  ja: {
    open: '仕様を選択／ウィッシュリストに追加',
    close: '閉じる',
    loading: '公式の仕様を取得中…',
    error: '公式の仕様を取得できません。',
    retry: '再試行',
    quantity: '数量',
    limit: '公式購入上限',
    unknown: '公式の上限は不明です。99 はリスト内の管理上限です。',
    unavailable: 'この組み合わせは利用できません。',
    outOfStock: 'この仕様は在庫切れですがリストに追加できます。',
    checking: '仕様を確認中…',
    variationError: 'この仕様の購入上限を確認できません。',
    add: 'ウィッシュリストに追加',
    saving: '保存中…',
  },
};
export function ShopProductPicker(props: Props) {
  return <ShopProductPickerContent key={props.product.slug} {...props} />;
}

function ShopProductPickerContent({
  product,
  language,
  disabled = false,
  onAdd,
}: Props) {
  const lang = language.startsWith('zh') ? 'zh'
    : language.startsWith('ja') ? 'ja' : 'en';
  const t = translations[lang];

  const [expanded, setExpanded] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [options, setOptions] = useState<ShopOptionsResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<(number | null)[]>([]);
  const [variationResult, setVariationResult] = useState<{
    options: ShopOptionsResponse; selectionKey: string;
    value: ShopVariationResponse | null; error: boolean;
  } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    const controller = new AbortController();
    void getShopProductOptions(product.slug, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.stale) throw new Error('Stale specification data');
        setOptions(result);
        setSelectedIds(result.specifications.map(() => null));
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [expanded, product.slug, retryCount]);

  const complete = !!options &&
    selectedIds.length === options.specifications.length &&
    selectedIds.every(id => id !== null);

  const selectedCombination = complete
    ? selectedIds.filter((id): id is number => id !== null)
    : [];

  const validCombination = !!options && complete &&
    options.valid_combinations.some(combo =>
      combo.length === selectedCombination.length &&
      combo.every((id, index) => id === selectedCombination[index]),
    );

  const selectionKey = selectedCombination.join(',');

  const currentVariation = validCombination && variationResult?.options === options
    && variationResult.selectionKey === selectionKey ? variationResult : null;
  const variation = currentVariation?.value ?? null;
  const checking = !!options?.has_options && validCombination && !currentVariation;
  const variationError = currentVariation?.error ?? false;

  useEffect(() => {
    if (!expanded || !options?.has_options || !validCombination) return;
    const controller = new AbortController();
    void getShopVariation(product.slug, selectionKey.split(',').map(Number), controller.signal)
      .then(result => {
        if (!controller.signal.aborted) setVariationResult({ options, selectionKey, value: result, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setVariationResult({ options, selectionKey, value: null, error: true });
      });
    return () => controller.abort();
  }, [expanded, options, validCombination, selectionKey, product.slug]);

  function prepareOptions() {
    setLoading(true);
    setLoadError(false);
    setOptions(null);
    setVariationResult(null);
    setSelectedIds([]);
    setQuantity(1);
  }

  const limits = [
    options?.sale_upper_limit,
    variation?.upper_limit,
  ].filter((limit): limit is number => typeof limit === 'number');

  const upperLimit = limits.length > 0
    ? Math.min(...limits)
    : null;

  const maxQuantity = upperLimit === null
    ? 99
    : Math.min(99, upperLimit);

  const canAdd = !!options &&
    !loading &&
    !loadError &&
    !saving &&
    !disabled &&
    (
      !options.has_options ||
      (validCombination && !!variation && !checking && !variationError)
    ) &&
    maxQuantity >= 1;

  function chooseOption(index: number, id: number) {
    if (selectedIds[index] === id) return;
    setVariationResult(null);
    setSelectedIds(previous =>
      previous.map((value, i) => i === index ? id : value),
    );
    setQuantity(1);
  }

  function isSelectable(index: number, id: number): boolean {
    if (!options) return false;

    return options.valid_combinations.some(combo =>
      combo.length === selectedIds.length &&
      combo.every((value, i) =>
        i === index || selectedIds[i] === null || selectedIds[i] === value,
      ) &&
      combo[index] === id,
    );
  }

  async function save() {
    if (!canAdd || !options) return;

    const selectedOptions: Record<string, string> = {};

    options.specifications.forEach((spec, index) => {
      const value = spec.values.find(item => item.id === selectedIds[index]);
      if (value) {
        const key = Object.prototype.hasOwnProperty.call(
          selectedOptions, spec.name,
        ) ? `${spec.name} (${spec.id})` : spec.name;
        selectedOptions[key] = value.name;
      }
    });

    setSaving(true);
    try {
      await onAdd(
        Math.max(1, Math.min(quantity, maxQuantity)),
        selectedOptions,
        upperLimit,
        options.sale_upper_limit,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        onPress={() => { if (!expanded) prepareOptions(); setExpanded(value => !value); }}
        style={styles.button}
      >
        <Text style={styles.buttonText}>{expanded ? t.close : t.open}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.panel}>
          {loading && (
            <View style={styles.row}>
              <ActivityIndicator color={C.accent} />
              <Text style={styles.note}>{t.loading}</Text>
            </View>
          )}

          {loadError && (
            <View style={styles.panel}>
              <Text accessibilityRole="alert" style={styles.note}>{t.error}</Text>
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => { prepareOptions(); setRetryCount(value => value + 1); }}
              >
                <Text style={styles.buttonText}>{t.retry}</Text>
              </Pressable>
            </View>
          )}

          {options?.specifications.map((spec, index) => (
            <View key={spec.id} style={styles.panel}>
              <Text style={styles.heading}>{spec.name}</Text>
              <View style={styles.row}>
                {spec.values.map(value => {
                  const active = selectedIds[index] === value.id;
                  const selectable = isSelectable(index, value.id);

                  return (
                    <Pressable
                      key={value.id}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: active,
                        disabled: !selectable,
                      }}
                      disabled={!selectable}
                      onPress={() => chooseOption(index, value.id)}
                      style={[
                        styles.option,
                        active && styles.selected,
                        !selectable && styles.disabled,
                      ]}
                    >
                      <Text style={styles.buttonText}>{value.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {options?.has_options && complete && !validCombination && (
            <Text style={styles.note}>{t.unavailable}</Text>
          )}
          {checking && <Text style={styles.note}>{t.checking}</Text>}
          {variationError && (
            <Text accessibilityRole="alert" style={styles.note}>
              {t.variationError}
            </Text>
          )}
          {variation && !variation.has_stock && (
            <Text style={styles.note}>{t.outOfStock}</Text>
          )}

          {options && (!options.has_options || variation) && (
            <View style={styles.panel}>
              <Text style={styles.heading}>{t.quantity}</Text>
              <Text style={styles.note}>
                {upperLimit === null ? t.unknown : `${t.limit}: ${upperLimit}`}
              </Text>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="-"
                  disabled={quantity <= 1}
                  style={[styles.option, quantity <= 1 && styles.disabled]}
                  onPress={() => setQuantity(value => Math.max(1, value - 1))}
                >
                  <Text style={styles.buttonText}>-</Text>
                </Pressable>
                <Text style={styles.quantity}>{Math.min(quantity, Math.max(1, maxQuantity))}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="+"
                  disabled={quantity >= maxQuantity}
                  style={[styles.option, quantity >= maxQuantity && styles.disabled]}
                  onPress={() => setQuantity(value => Math.min(maxQuantity, value + 1))}
                >
                  <Text style={styles.buttonText}>+</Text>
                </Pressable>
              </View>
            </View>
          )}

          {options && (
            <Pressable
              accessibilityRole="button"
              disabled={!canAdd}
              onPress={() => void save()}
              style={[styles.button, !canAdd && styles.disabled]}
            >
              <Text style={styles.buttonText}>{saving ? t.saving : t.add}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  panel: { gap: 10 },
  heading: { color: C.text, fontWeight: '600', fontSize: 13 },
  note: { color: C.muted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  button: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: C.surfaceAlt,
    alignSelf: 'flex-start',
  },
  buttonText: { color: C.accent, fontWeight: '600', fontSize: 12 },
  option: {
    minWidth: 42,
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  selected: { borderColor: C.accent, backgroundColor: C.surfaceAlt },
  disabled: { opacity: 0.35 },
  quantity: { color: C.text, minWidth: 24, textAlign: 'center' },
});
