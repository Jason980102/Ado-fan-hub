export type ShopTheme = { id: number; slug: string; title: string; image_url: string | null; visual_kind: 'campaign' | 'product_preview' | 'none'; url: string;
  campaign_status: 'active' | 'ended' | 'unverified';
  wishlist_eligible: boolean;
  campaign_ends_at: string | null;
  campaign_source_url: string | null;
};
export type ShopProduct = { slug: string; title: string; price_jpy: number; image_url: string | null; status: 'available' | 'ended' | 'sold_out' | 'upcoming' | 'unknown'; labels: string[]; url: string };
type Meta = { source: string; checked_at: string; cached: boolean; stale: boolean };
export type ThemesResponse = Meta & { themes: ShopTheme[] };
export type ProductsResponse = Meta & { theme: ShopTheme; products: ShopProduct[]; total: number; page: number; has_more: boolean };
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
function validTheme(t: ShopTheme) {
  return t && Number.isSafeInteger(t.id) && t.id >= 0 && identifier(t.slug) && typeof t.title === 'string' && ['campaign', 'product_preview', 'none'].includes(t.visual_kind) && (t.image_url === null || /^https:\/\/images\.groobee\.com\/images\/ado-officialshop\//.test(t.image_url)) && t.url === `https://ado-officialshop-friedpotato.com/shops/${t.slug}` &&
    ['active', 'ended', 'unverified'].includes(t.campaign_status) &&
    typeof t.wishlist_eligible === 'boolean' &&
    (t.campaign_ends_at === null ||
      (typeof t.campaign_ends_at === 'string' &&
       Number.isFinite(Date.parse(t.campaign_ends_at)))) &&
    (t.campaign_source_url === null ||
      (typeof t.campaign_source_url === 'string' &&
       t.campaign_source_url.startsWith('https://ado-officialshop-friedpotato.com/'))) &&
    (t.campaign_status === 'active') === t.wishlist_eligible;
}
async function read(path: string, signal: AbortSignal) {
  const base = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ANALYTICS_API_URL;
  if (!base) throw new Error('API unavailable');
  const response = await fetch(`${base.replace(/\/+$/, '')}/api/shop/${path}`, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Catalogue unavailable');
  const result = await response.json();
  if (!result || typeof result.source !== 'string' || !Number.isFinite(Date.parse(result.checked_at)) || typeof result.cached !== 'boolean' || typeof result.stale !== 'boolean') throw new Error('Invalid catalogue');
  return result;
}
export async function getShopThemes(signal: AbortSignal): Promise<ThemesResponse> {
  const result: ThemesResponse = await read('themes', signal);
  if (!Array.isArray(result.themes) || result.themes.length > 200 || !result.themes.every(validTheme)) throw new Error('Invalid themes');
  return result;
}
export async function getShopProducts(theme: string, page: number, signal: AbortSignal): Promise<ProductsResponse> {
  if (!identifier(theme)) throw new Error('Invalid theme');
  const result: ProductsResponse = await read(`themes/${encodeURIComponent(theme)}/products?page=${page}`, signal);
  if (!validTheme(result.theme) || result.theme.slug !== theme || result.page !== page || !Number.isSafeInteger(result.total) || result.total < 0 || typeof result.has_more !== 'boolean' || !Array.isArray(result.products) || result.products.length > 24 ||
    !result.products.every(p => p && identifier(p.slug) && typeof p.title === 'string' && Number.isSafeInteger(p.price_jpy) && p.price_jpy >= 0 && ['available', 'ended', 'sold_out', 'upcoming', 'unknown'].includes(p.status) && Array.isArray(p.labels) && p.labels.every(l => typeof l === 'string') &&
      (p.image_url === null || /^https:\/\/images\.groobee\.com\/images\/ado-officialshop\//.test(p.image_url)) && p.url === `https://ado-officialshop-friedpotato.com/products/${p.slug}`)) throw new Error('Invalid products');
  return result;
}


export type ShopSpecificationValue = {
  id: number;
  name: string;
};

export type ShopSpecification = {
  id: number;
  name: string;
  values: ShopSpecificationValue[];
};

export type ShopOptionsResponse = Meta & {
  slug: string;
  has_options: boolean;
  sale_upper_limit: number | null;
  specifications: ShopSpecification[];
  valid_combinations: number[][];
};

export type ShopVariationResponse = Meta & {
  slug: string;
  value_ids: number[];
  variation_id: number;
  has_stock: boolean;
  upper_limit: number | null;
};

function positiveId(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value > 0;
}

export async function getShopProductOptions(
  productSlug: string,
  signal: AbortSignal,
): Promise<ShopOptionsResponse> {
  if (!identifier(productSlug)) {
    throw new Error('Invalid product identifier');
  }

  const result: ShopOptionsResponse = await read(
    `products/${encodeURIComponent(productSlug)}/options`,
    signal,
  );

  if (
    result.slug !== productSlug ||
    typeof result.has_options !== 'boolean' ||
    !(
      result.sale_upper_limit === null ||
      (
        typeof result.sale_upper_limit === 'number' &&
        Number.isSafeInteger(result.sale_upper_limit) &&
        result.sale_upper_limit >= 0
      )
    ) ||
    !Array.isArray(result.specifications) ||
    result.specifications.length > 5 ||
    !Array.isArray(result.valid_combinations) ||
    result.valid_combinations.length > 200
  ) {
    throw new Error('Invalid product options');
  }

  const groups: Set<number>[] = [];
  const allIds = new Set<number>();

  for (const spec of result.specifications) {
    if (
      !spec ||
      !positiveId(spec.id) ||
      typeof spec.name !== 'string' ||
      !spec.name.trim() ||
      !Array.isArray(spec.values) ||
      spec.values.length > 100
    ) {
      throw new Error('Invalid specification');
    }

    const ids = new Set<number>();

    for (const value of spec.values) {
      if (
        !value ||
        !positiveId(value.id) ||
        typeof value.name !== 'string' ||
        !value.name.trim() ||
        allIds.has(value.id)
      ) {
        throw new Error('Invalid specification value');
      }

      ids.add(value.id);
      allIds.add(value.id);
    }

    groups.push(ids);
  }

  if (result.has_options !== (groups.length > 0)) {
    throw new Error('Invalid options flag');
  }

  for (const combination of result.valid_combinations) {
    if (
      !Array.isArray(combination) ||
      combination.length !== groups.length ||
      !combination.every(
        (id, index) => positiveId(id) && groups[index].has(id),
      )
    ) {
      throw new Error('Invalid specification combination');
    }
  }

  return result;
}

export async function getShopVariation(
  productSlug: string,
  valueIds: number[],
  signal: AbortSignal,
): Promise<ShopVariationResponse> {
  if (
    !identifier(productSlug) ||
    !Array.isArray(valueIds) ||
    valueIds.length < 1 ||
    valueIds.length > 5 ||
    !valueIds.every(positiveId)
  ) {
    throw new Error('Invalid variation request');
  }

  const result: ShopVariationResponse = await read(
    `products/${encodeURIComponent(productSlug)}/variation?value_ids=${valueIds.join(',')}`,
    signal,
  );

  if (
    result.slug !== productSlug ||
    !Array.isArray(result.value_ids) ||
    result.value_ids.length !== valueIds.length ||
    !result.value_ids.every(
      (id, index) => id === valueIds[index],
    ) ||
    !positiveId(result.variation_id) ||
    typeof result.has_stock !== 'boolean' ||
    !(
      result.upper_limit === null ||
      (
        typeof result.upper_limit === 'number' &&
        Number.isSafeInteger(result.upper_limit) &&
        result.upper_limit >= 0
      )
    )
  ) {
    throw new Error('Invalid variation response');
  }

  return result;
}
