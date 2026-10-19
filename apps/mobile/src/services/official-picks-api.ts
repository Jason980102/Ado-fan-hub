/**
 * API client for Ado-curated videos uploaded by other creators.
 * These videos are never included in the Ado MV catalog statistics.
 */

export const OFFICIAL_PICKS_PLAYLIST_ID =
  'PLaxauk3chSWgJmo2hBhN34rO8sUEwWiQx';

export const OFFICIAL_PICKS_OWNER_ID =
  'UCln9P4Qm3-EAY4aiEPmRwEA';

export type OfficialPickVideo = {
  id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  thumbnail_url: string | null;
  url: string;
};

export type OfficialPicksResponse = {
  playlist_id: string;
  title: string;
  owner_channel_id: string;
  videos: OfficialPickVideo[];
};

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const channelIdPattern = /^UC[A-Za-z0-9_-]{22}$/;

export function isOfficialPicks(
  value: unknown,
): value is OfficialPicksResponse {
  if (!value || typeof value !== 'object') return false;

  const data = value as Partial<OfficialPicksResponse>;

  if (
    data.playlist_id !== OFFICIAL_PICKS_PLAYLIST_ID
    || data.owner_channel_id !== OFFICIAL_PICKS_OWNER_ID
    || typeof data.title !== 'string'
    || !data.title.trim()
    || !Array.isArray(data.videos)
  ) {
    return false;
  }

  const seen = new Set<string>();

  return data.videos.every((video: unknown) => {
    if (!video || typeof video !== 'object') return false;

    const item = video as Partial<OfficialPickVideo>;

    if (
      typeof item.id !== 'string'
      || !videoIdPattern.test(item.id)
      || seen.has(item.id)
      || typeof item.title !== 'string'
      || !item.title.trim()
      || typeof item.channel_id !== 'string'
      || !channelIdPattern.test(item.channel_id)
      || item.channel_id === OFFICIAL_PICKS_OWNER_ID
      || typeof item.channel_title !== 'string'
      || !item.channel_title.trim()
      || item.url !== `https://www.youtube.com/watch?v=${item.id}`
      || !(
        item.thumbnail_url === null
        || (
          typeof item.thumbnail_url === 'string'
          && /^https:\/\/i\.ytimg\.com\//.test(item.thumbnail_url)
        )
      )
    ) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

export async function getOfficialPicks(
  signal: AbortSignal,
): Promise<OfficialPicksResponse> {
  const base =
    process.env.EXPO_PUBLIC_ANALYTICS_API_URL
    || process.env.EXPO_PUBLIC_API_URL;

  if (!base) {
    throw new Error('Official picks API URL is not configured');
  }

  const response = await fetch(
    `${base.replace(/\/+$/, '')}/api/mv/official-picks`,
    {
      headers: { Accept: 'application/json' },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Official picks HTTP ${response.status}`);
  }

  const result: unknown = await response.json();

  if (!isOfficialPicks(result)) {
    throw new Error('Invalid official picks response');
  }

  return result;
}
