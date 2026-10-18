import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCampaignStatuses, isShopThemeActive, type ShopProduct, type ShopTheme, type CampaignInfo } from './shop-api';

const STORAGE_KEY = '@ado-fan-hub/wishlist/v1';

export type WishlistItem = {
  id: string;
  themeSlug: string;
  productSlug: string;
  title: string;
  priceJpy: number;
  imageUrl: string | null;
  officialUrl: string;
  quantity: number;
  officialUpperLimit?: number | null;
  officialProductUpperLimit?: number | null;
  selectedOptions: Record<string, string>;
  notifyWhenAvailable: boolean;
  addedAt: string;
  campaignStatus?: ShopTheme['campaign_status'];
  campaignEndsAt?: string | null;
};

function makeId(
  themeSlug: string,
  productSlug: string,
  options: Record<string, string>,
): string {
  const sorted = Object.entries(options).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return JSON.stringify([themeSlug, productSlug, sorted]);
}

function validateQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new Error('Quantity must be between 1 and 99');
  }
}

export async function loadWishlist(): Promise<WishlistItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);

  if (raw === null) {
    return [];
  }

  const parsed: unknown = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid saved wishlist data');
  }

  return parsed as WishlistItem[];
}

async function saveWishlist(items: WishlistItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function addToWishlist(
  theme: ShopTheme,
  product: ShopProduct,
  quantity = 1,
  selectedOptions: Record<string, string> = {},
  officialUpperLimit: number | null = null,
  officialProductUpperLimit: number | null = null,
): Promise<WishlistItem[]> {
  return mutateWishlist(async () => {
  if (!isShopThemeActive(theme)) throw new Error('Campaign not available for wishlist');
  validateQuantity(quantity);

  for (const limit of [officialUpperLimit, officialProductUpperLimit]) {
    if (
      limit !== null &&
      (!Number.isSafeInteger(limit) || limit < 0)
    ) {
      throw new Error('Invalid official purchase limit');
    }
  }

  const id = makeId(theme.slug, product.slug, selectedOptions);
  const items = await loadWishlist();

  const existing = items.find(item => item.id === id);

  const optionLimit =
    officialUpperLimit ?? existing?.officialUpperLimit ?? null;

  const storedProductLimits = items
    .filter(item => item.productSlug === product.slug)
    .map(item => item.officialProductUpperLimit)
    .filter((limit): limit is number =>
      typeof limit === 'number' &&
      Number.isSafeInteger(limit) &&
      limit >= 0
    );

  const productLimit = officialProductUpperLimit ??
    (storedProductLimits.length
      ? Math.min(...storedProductLimits)
      : null);

  const nextQuantity = (existing?.quantity ?? 0) + quantity;

  if (nextQuantity > 99) {
    throw new Error('Wishlist planning quantity limit exceeded');
  }

  if (optionLimit !== null && nextQuantity > optionLimit) {
    throw new Error('Official variant purchase limit exceeded');
  }

  const currentProductTotal = items
    .filter(item => item.productSlug === product.slug)
    .reduce((total, item) => total + item.quantity, 0);

  if (
    productLimit !== null &&
    currentProductTotal + quantity > productLimit
  ) {
    throw new Error('Official product purchase limit exceeded');
  }

  if (existing) {
    existing.quantity = nextQuantity;
    existing.campaignStatus = theme.campaign_status;
    existing.campaignEndsAt = theme.campaign_ends_at;
    existing.officialUpperLimit = optionLimit;
    existing.officialProductUpperLimit = productLimit;
  } else {
    items.push({
      id,
      themeSlug: theme.slug,
      productSlug: product.slug,
      title: product.title,
      priceJpy: product.price_jpy,
      imageUrl: product.image_url,
      officialUrl: product.url,
      quantity,
      officialUpperLimit: optionLimit,
      officialProductUpperLimit: productLimit,
      selectedOptions: { ...selectedOptions },
      notifyWhenAvailable: false,
      addedAt: new Date().toISOString(),
      campaignStatus: theme.campaign_status,
      campaignEndsAt: theme.campaign_ends_at,
    });
  }

  if (officialProductUpperLimit !== null) {
    for (const item of items) {
      if (item.productSlug === product.slug) {
        item.officialProductUpperLimit = officialProductUpperLimit;
      }
    }
  }

  await saveWishlist(items);
  return items;
  });
}

export async function updateWishlistQuantity(
  id: string,
  quantity: number,
): Promise<WishlistItem[]> {
  return mutateWishlist(async () => {
  validateQuantity(quantity);

  const items = await loadWishlist();
  const item = items.find(entry => entry.id === id);

  if (!item) {
    throw new Error('Wishlist item not found');
  }

  if (
    typeof item.officialUpperLimit === 'number' &&
    quantity > item.officialUpperLimit
  ) {
    throw new Error('Official variant purchase limit exceeded');
  }

  const productLimits = items
    .filter(entry => entry.productSlug === item.productSlug)
    .map(entry => entry.officialProductUpperLimit)
    .filter((limit): limit is number =>
      typeof limit === 'number' &&
      Number.isSafeInteger(limit) &&
      limit >= 0
    );

  if (productLimits.length > 0) {
    const productLimit = Math.min(...productLimits);
    const otherQuantity = items.reduce(
      (total, entry) =>
        total + (
          entry.productSlug === item.productSlug && entry.id !== id
            ? entry.quantity
            : 0
        ),
      0,
    );

    if (quantity + otherQuantity > productLimit) {
      throw new Error('Official product purchase limit exceeded');
    }
  }

  item.quantity = quantity;
  await saveWishlist(items);

  return items;
  });
}

export async function removeFromWishlist(
  id: string,
): Promise<WishlistItem[]> {
  return mutateWishlist(async () => {
  const items = await loadWishlist();
  const updated = items.filter(item => item.id !== id);

  await saveWishlist(updated);
  return updated;
  });
}

export async function updateWishlistNotification(
  id: string,
  enabled: boolean,
): Promise<WishlistItem[]> {
  return mutateWishlist(async () => {
  const items = await loadWishlist();
  const item = items.find(entry => entry.id === id);

  if (!item) {
    throw new Error('Wishlist item not found');
  }

  item.notifyWhenAvailable = enabled;
  await saveWishlist(items);

  return items;
  });
}


export function getWishlistQuantityMax(
  items: WishlistItem[],
  item: WishlistItem,
): number {
  const limits = [99];

  if (
    typeof item.officialUpperLimit === 'number' &&
    Number.isSafeInteger(item.officialUpperLimit) &&
    item.officialUpperLimit >= 0
  ) {
    limits.push(item.officialUpperLimit);
  }

  const productLimits = items
    .filter(entry => entry.productSlug === item.productSlug)
    .map(entry => entry.officialProductUpperLimit)
    .filter((limit): limit is number =>
      typeof limit === 'number' &&
      Number.isSafeInteger(limit) &&
      limit >= 0
    );

  if (productLimits.length > 0) {
    const otherQuantity = items.reduce(
      (total, entry) =>
        total + (
          entry.productSlug === item.productSlug && entry.id !== item.id
            ? entry.quantity
            : 0
        ),
      0,
    );

    limits.push(
      Math.max(0, Math.min(...productLimits) - otherQuantity),
    );
  }

  return Math.max(0, Math.min(...limits));
}

export function calculateWishlistSubtotal(
  items: WishlistItem[],
): number {
  return items.reduce(
    (total, item) => total + item.priceJpy * item.quantity,
    0,
  );
}

let mutationQueue: Promise<void> = Promise.resolve();
function mutateWishlist<T>(action: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(action, action);
  mutationQueue = result.then(() => {}, () => {});
  return result;
}

export function getWishlistCampaignStatus(item: WishlistItem, now = Date.now()): 'active' | 'ended' | 'unverified' {
  if (item.campaignStatus === 'ended'
    || (item.campaignEndsAt && Number.isFinite(Date.parse(item.campaignEndsAt)) && now >= Date.parse(item.campaignEndsAt))) return 'ended';
  return item.campaignStatus ?? 'unverified';
}

export async function refreshWishlistCampaigns(signal: AbortSignal): Promise<WishlistItem[]> {
  const saved = await loadWishlist();
  const slugs = [...new Set(saved.map(item => item.themeSlug))];
  const campaigns = new Map<string, CampaignInfo>();
  try {
    for (let i = 0; i < slugs.length; i += 200) {
      for (const info of await getCampaignStatuses(slugs.slice(i, i + 200), signal)) campaigns.set(info.slug, info);
    }
  } catch { /* Saved deadlines still apply while offline; unknown is never inferred as ended. */ }
  if (signal.aborted) return loadWishlist();
  return mutateWishlist(async () => {
    // Reload after network I/O so quantity edits/additions/removals are preserved.
    const latest = await loadWishlist();
    const updated = latest.map(item => {
      const info = campaigns.get(item.themeSlug);
      const next = info && info.campaign_status !== 'unverified'
        ? { ...item, campaignStatus: info.campaign_status, campaignEndsAt: info.campaign_ends_at } : { ...item };
      if (getWishlistCampaignStatus(item) === 'ended' || getWishlistCampaignStatus(next) === 'ended') {
        next.campaignStatus = 'ended';
        next.notifyWhenAvailable = false;
      }
      return next;
    });
    if (JSON.stringify(latest) !== JSON.stringify(updated)) await saveWishlist(updated);
    return updated;
  });
}
