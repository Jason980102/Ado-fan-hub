export type AnalyticsResponse = {
  source: string;
  fetched_at: string;
  cached: boolean;
  channel: {
    id: string;
    title: string;
    avatar_url: string | null;
    subscriber_count: number | null;
    subscriber_count_is_approximate: boolean;
    view_count: number | null;
    video_count: number | null;
  };
  videos: {
    id: string;
    title: string;
    categories: ('original' | 'cover')[];
    published_at: string;
    thumbnail_url: string | null;
    view_count: number | null;
    url: string;
  }[];
  unavailable_video_ids: string[];
};

export async function getAnalytics(
  signal: AbortSignal
): Promise<AnalyticsResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_ANALYTICS_API_URL
    || process.env.EXPO_PUBLIC_API_URL;

  if (!baseUrl) throw new Error('Analytics API URL is not configured');

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/api/analytics/youtube`,
    { headers: { Accept: 'application/json' }, signal }
  );

  if (!response.ok) throw new Error(`Analytics HTTP ${response.status}`);

  const data: AnalyticsResponse = await response.json();
  const validCount = (value: unknown) =>
    value === null ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

  if (
    !data || typeof data.source !== 'string' ||
    typeof data.cached !== 'boolean' ||
    typeof data.fetched_at !== 'string' ||
    !Number.isFinite(Date.parse(data.fetched_at)) ||
    !data.channel || typeof data.channel.title !== 'string' ||
    !(data.channel.avatar_url === null ||
      (typeof data.channel.avatar_url === 'string' &&
        /^https:\/\/(?:yt3\.ggpht\.com|yt3\.googleusercontent\.com)\//.test(
          data.channel.avatar_url
        ))) ||
    typeof data.channel.subscriber_count_is_approximate !== 'boolean' ||
    !validCount(data.channel.subscriber_count) ||
    !validCount(data.channel.view_count) ||
    !validCount(data.channel.video_count) ||
    !Array.isArray(data.videos) ||
    !Array.isArray(data.unavailable_video_ids) ||
    !data.videos.every((video) =>
      video &&
      /^[A-Za-z0-9_-]{11}$/.test(video.id) &&
      typeof video.title === 'string' &&
      Array.isArray(video.categories) &&
      video.categories.length > 0 &&
      video.categories.length <= 2 &&
      new Set(video.categories).size === video.categories.length &&
      video.categories.every((category) =>
        category === 'original' || category === 'cover'
      ) &&
      Number.isFinite(Date.parse(video.published_at)) &&
      (video.thumbnail_url === null ||
        (typeof video.thumbnail_url === 'string' &&
          video.thumbnail_url.startsWith('https://i.ytimg.com/'))) &&
      validCount(video.view_count)
    )
  ) {
    throw new Error('Invalid Analytics response');
  }

  return data;
}

export function getChannelAvatarUrl(): string {
  const baseUrl = process.env.EXPO_PUBLIC_ANALYTICS_API_URL
    || process.env.EXPO_PUBLIC_API_URL;

  if (!baseUrl) throw new Error('Analytics API URL is not configured');

  return `${baseUrl.replace(/\/+$/, '')}/api/analytics/youtube/avatar`;
}

export type ChannelHistoryPoint = {
  fetched_at: string;
  subscriber_count: number | null;
  subscriber_count_is_approximate: boolean;
  view_count: number | null;
  video_count: number | null;
};

export type ChannelHistoryResponse = {
  channel_id: string;
  days: number;
  since: string;
  limit: number;
  truncated: boolean;
  points: ChannelHistoryPoint[];
};

export async function getChannelHistory(
  signal: AbortSignal,
  days: 7 | 30 | 90 = 30
): Promise<ChannelHistoryResponse> {
  const baseUrl = process.env.EXPO_PUBLIC_ANALYTICS_API_URL
    || process.env.EXPO_PUBLIC_API_URL;

  if (!baseUrl) throw new Error('Analytics API URL is not configured');

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/api/analytics/youtube/history?days=${days}`,
    { headers: { Accept: 'application/json' }, signal }
  );

  if (!response.ok) {
    throw new Error(`History HTTP ${response.status}`);
  }

  const data: ChannelHistoryResponse = await response.json();
  const validCount = (value: unknown) =>
    value === null ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
  const validDate = (value: unknown) =>
    typeof value === 'string' && Number.isFinite(Date.parse(value));

  if (
    !data ||
    typeof data.channel_id !== 'string' ||
    !/^UC[A-Za-z0-9_-]{22}$/.test(data.channel_id) ||
    data.days !== days ||
    !validDate(data.since) ||
    !Number.isInteger(data.limit) ||
    data.limit < 1 || data.limit > 10000 ||
    typeof data.truncated !== 'boolean' ||
    !Array.isArray(data.points) ||
    data.points.length > data.limit ||
    !data.points.every((point, index, points) =>
      point &&
      validDate(point.fetched_at) &&
      typeof point.subscriber_count_is_approximate === 'boolean' &&
      validCount(point.subscriber_count) &&
      validCount(point.view_count) &&
      validCount(point.video_count) &&
      (index === 0 ||
        Date.parse(point.fetched_at) >
        Date.parse(points[index - 1].fetched_at))
    )
  ) {
    throw new Error('Invalid Analytics history response');
  }

  return data;
}
// Shared by Analytics and its home preview: same scope, null handling and tie-break.
export function rankMvVideos(
  videos: AnalyticsResponse['videos'],
  category: 'all' | 'original' | 'cover' = 'all',
) {
  return videos
    .filter(video => category === 'all' || video.categories.includes(category))
    .filter(video => video.view_count !== null)
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0) || a.id.localeCompare(b.id))
    .slice(0, 10);
}
