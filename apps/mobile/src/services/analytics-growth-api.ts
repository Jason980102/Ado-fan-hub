export type Period = { from: string; to: string; partial: boolean };
export type Growth = {
  channel_id: string;
  channel: (Period & { changes: { subscriber_count: number | null; view_count: number | null; video_count: number | null } }) | null;
  mv_period: Period | null;
  videos: { id: string; title: string; thumbnail_url: string | null; view_count: number; delta: number }[];
  excluded: number;
};

function validGrowth(value: Growth) {
  const period = (p: Period) => p && typeof p.partial === 'boolean' && Number.isFinite(Date.parse(p.from)) && Number.isFinite(Date.parse(p.to)) && Date.parse(p.from) <= Date.parse(p.to);
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v);
  return value && typeof value.channel_id === 'string' &&
    (value.channel === null || (period(value.channel) && ['subscriber_count', 'view_count', 'video_count'].every(k => {
      const v = value.channel!.changes[k as keyof NonNullable<Growth['channel']>['changes']];
      return v === null || count(v);
    }))) && (value.mv_period === null || period(value.mv_period)) && Array.isArray(value.videos) && value.videos.length <= 10 &&
    value.videos.every(v => /^[A-Za-z0-9_-]{11}$/.test(v.id) && typeof v.title === 'string' && count(v.delta) && count(v.view_count) && v.view_count >= 0 &&
      (v.thumbnail_url === null || /^https:\/\/i\.ytimg\.com\//.test(v.thumbnail_url)));
}

export async function getGrowth(signal: AbortSignal): Promise<Growth> {
  const base = process.env.EXPO_PUBLIC_ANALYTICS_API_URL || process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error('Missing API');
  const response = await fetch(`${base.replace(/\/+$/, '')}/api/analytics/youtube/growth`, { signal });
  if (!response.ok) throw new Error('Growth unavailable');
  const result: Growth = await response.json();
  if (!validGrowth(result)) throw new Error('Invalid growth');
  return result;
}
