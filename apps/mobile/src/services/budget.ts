import type { WishlistItem } from './wishlist';
import { calculateWishlistSubtotal } from './wishlist';

export type BudgetCurrency = 'JPY' | 'USD' | 'TWD';

export type FxSnapshot = {
  dates: { USD: string; TWD: string };
  fetchedAt: string;
  checkedAt: string;
  nextCheckAt: string;
  source: string;
  stale: boolean;
  awaitingPublication: boolean;
  rates: Record<BudgetCurrency, number>;
};

export type BudgetEstimate = {
  subtotalJpy: number;
  shippingJpy: number;
  totalJpy: number;
  currency: BudgetCurrency;
  convertedTotal: number;
};

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function isFxSnapshot(value: unknown): value is FxSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FxSnapshot>;
  return typeof item.source === 'string' && item.source.length > 0
    && [item.fetchedAt, item.checkedAt, item.nextCheckAt].every(
      time => typeof time === 'string' && Number.isFinite(Date.parse(time)),
    )
    && validDate(item.dates?.USD) && validDate(item.dates?.TWD)
    && typeof item.stale === 'boolean' && typeof item.awaitingPublication === 'boolean'
    && item.rates?.JPY === 1
    && typeof item.rates?.USD === 'number' && Number.isFinite(item.rates.USD) && item.rates.USD > 0
    && typeof item.rates?.TWD === 'number' && Number.isFinite(item.rates.TWD) && item.rates.TWD > 0;
}

export async function fetchBudgetRates(signal?: AbortSignal): Promise<FxSnapshot> {
  const base = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ANALYTICS_API_URL;
  if (!base) throw new Error('API unavailable');
  const response = await fetch(`${base.replace(/\/+$/, '')}/api/fx/rates`, {
    signal, headers: { Accept: 'application/json' }, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Exchange rate API failed: ${response.status}`);
  const data: unknown = await response.json();
  if (!isFxSnapshot(data)) throw new Error('Invalid exchange rate response');
  return data;
}

export function calculateBudgetEstimate(
  items: WishlistItem[],
  shippingJpy: number,
  currency: BudgetCurrency,
  fx: FxSnapshot,
): BudgetEstimate {
  if (
    !Number.isFinite(shippingJpy) ||
    shippingJpy < 0 ||
    shippingJpy > 1_000_000_000
  ) {
    throw new Error('Invalid shipping estimate');
  }

  const rate = fx.rates[currency];

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid exchange rate');
  }

  const subtotalJpy = calculateWishlistSubtotal(items);
  const totalJpy = subtotalJpy + shippingJpy;

  return {
    subtotalJpy,
    shippingJpy,
    totalJpy,
    currency,
    convertedTotal: totalJpy * rate,
  };
}

export function formatBudgetAmount(
  amount: number,
  currency: BudgetCurrency,
  locale = 'en-US',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}
