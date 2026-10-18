import type { AnalyticsResponse } from '@/services/analytics-api';

export const mvCategories = ['original', 'cover', 'live', 'collaboration', 'other', 'unclassified'] as const;
export type MvCategory = typeof mvCategories[number];
export type CatalogVideo = Omit<AnalyticsResponse['videos'][number], 'categories'> & {
  categories: MvCategory[];
  like_count: number | null;
  channel_id: string;
  channel_title: string;
  playlist_ids: string[];
  aliases: string[];
};
export type MvCatalogResponse = {
  source: string; fetched_at: string; cached: boolean; partial: boolean;
  sources: { id: string; title: string; available: boolean; item_count: number | null }[];
  videos: CatalogVideo[];
  unavailable_video_ids: string[];
};

export function isMvCatalog(value: unknown): value is MvCatalogResponse {
  if (!value || typeof value !== 'object') return false;
  const data = value as MvCatalogResponse;
  const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v);
  const channel = (v: unknown) => typeof v === 'string' && /^UC[A-Za-z0-9_-]{22}$/.test(v);
  const count = (v: unknown) => v === null || (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0);
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
  return typeof data.source === 'string' && typeof data.fetched_at === 'string'
    && Number.isFinite(Date.parse(data.fetched_at)) && typeof data.cached === 'boolean' && typeof data.partial === 'boolean'
    && Array.isArray(data.sources) && data.sources.every(s => s && typeof s.id === 'string'
      && typeof s.title === 'string' && typeof s.available === 'boolean' && count(s.item_count))
    && Array.isArray(data.videos) && data.videos.every(v => v && id(v.id) && typeof v.title === 'string'
      && Array.isArray(v.categories) && v.categories.length > 0 && v.categories.every(c => mvCategories.includes(c))
      && typeof v.published_at === 'string' && Number.isFinite(Date.parse(v.published_at))
      && (v.thumbnail_url === null || (typeof v.thumbnail_url === 'string' && v.thumbnail_url.startsWith('https://i.ytimg.com/')))
      && count(v.view_count) && count(v.like_count) && v.url === `https://www.youtube.com/watch?v=${v.id}`
      && channel(v.channel_id) && typeof v.channel_title === 'string'
      && strings(v.playlist_ids) && v.playlist_ids.every(pid => data.sources.some(s => s.id === pid && s.available))
      && strings(v.aliases) && v.aliases.length <= 100)
    && Array.isArray(data.unavailable_video_ids) && data.unavailable_video_ids.every(id);
}

export async function getMvCatalog(signal: AbortSignal): Promise<MvCatalogResponse> {
  const base = process.env.EXPO_PUBLIC_ANALYTICS_API_URL || process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('MV API URL is not configured');
  const response = await fetch(`${base.replace(/\/+$/, '')}/api/mv/catalog`, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`MV catalog HTTP ${response.status}`);
  const result: unknown = await response.json();
  if (!isMvCatalog(result)) throw new Error('Invalid MV catalog');
  return result;
}
