import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { FanColors } from '@/constants/fan-theme';
import { usePreferences } from '@/contexts/preferences-context';
import type { AnalyticsResponse } from '@/services/analytics-api';

type Period = { from: string; to: string; partial: boolean };
type Growth = {
  channel_id: string;
  channel: (Period & { changes: { subscriber_count: number | null; view_count: number | null; video_count: number | null } }) | null;
  mv_period: Period | null;
  videos: { id: string; title: string; thumbnail_url: string | null; view_count: number; delta: number }[];
  excluded: number;
};
const words = {
  zh: { subs: '訂閱人數', views: '頻道總觀看數', videos: '公開影片數', week: '最近 7 天重點', subChange: '訂閱增減', viewChange: '觀看增減', videoChange: '影片增減', rank: 'MV 觀看增長排行', more: '進階數據', partial: '尚未累積滿 7 天，以下為已記錄期間的增減。', waiting: '尚需至少兩次有效快照才能比較；資料會隨後續更新累積。', error: '暫時無法載入增長分析', retry: '重試', approx: '約 ', excluded: '缺少比較資料的 MV 不列入排行。', total: '總觀看', same: '無變化', scope: '依官方原唱與 Cover 播放清單，比較同一時段的觀看增量。', rounded: '訂閱數為 YouTube 公開約數，增減也是約數。' },
  en: { subs: 'Subscribers', views: 'Channel views', videos: 'Public videos', week: 'Last 7 days', subChange: 'Subscriber change', viewChange: 'View change', videoChange: 'Video change', rank: 'MV view growth', more: 'Advanced data', partial: 'Less than 7 days recorded. Changes cover the recorded period below.', waiting: 'At least two valid snapshots are needed. History accumulates with future updates.', error: 'Growth analysis is temporarily unavailable', retry: 'Retry', approx: '≈ ', excluded: 'MVs without comparable observations are excluded.', total: 'Total views', same: 'No change', scope: 'View gains across the same period for official original and cover playlists.', rounded: 'Public subscriber counts and their changes are approximate.' },
  ja: { subs: '登録者数', views: 'チャンネル総再生数', videos: '公開動画数', week: '直近7日間の概要', subChange: '登録者数の増減', viewChange: '再生数の増減', videoChange: '動画数の増減', rank: 'MV再生数の増加ランキング', more: '詳細データ', partial: '7日分未満のため、以下の記録期間の増減です。', waiting: '比較には有効な記録が2件以上必要です。今後の更新で蓄積されます。', error: '増減データを取得できません', retry: '再試行', approx: '約 ', excluded: '比較データのないMVは対象外です。', total: '総再生数', same: '変化なし', scope: '公式オリジナル・カバープレイリストを同じ期間の再生増加数で比較します。', rounded: '公開登録者数と増減は概数です。' },
};

export function useDashboardWords() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language;
  return words[lang.startsWith('zh') ? 'zh' : lang.startsWith('ja') ? 'ja' : 'en'];
}

export function compactNumber(value: number | null, signed = false) {
  if (value === null) return '—';
  const abs = Math.abs(value);
  const unit = abs >= 1e9 ? 1e9 : abs >= 1e6 ? 1e6 : abs >= 1e3 ? 1e3 : 1;
  const suffix = unit === 1e9 ? 'B' : unit === 1e6 ? 'M' : unit === 1e3 ? 'K' : '';
  const rounded = unit === 1 ? String(abs) : (abs / unit).toFixed(2).replace(/\.?0+$/, '');
  return `${value < 0 ? '−' : signed && value > 0 ? '+' : ''}${rounded}${suffix}`;
}

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

export default function AnalyticsOverview({ data, onOpenVideo }: { data: AnalyticsResponse; onOpenVideo: (id: string) => void }) {
  const w = useDashboardWords();
  const { i18n } = useTranslation();
  const { preferences } = usePreferences();
  const [width, setWidth] = useState(0);
  const [result, setResult] = useState<{
    data: AnalyticsResponse; attempt: number; growth: Growth | null; error: boolean;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const current = result?.data === data && result.attempt === retry ? result : null;
  const growth = current?.growth ?? null;
  const error = current?.error ?? false;
  const busy = current === null;
  const [failed, setFailed] = useState<string[]>([]);
  const columns = width < 260 ? 1 : Platform.OS === 'web' && width >= 660 ? 3 : 2;
  const tileWidth = Math.max(1, (width - 12 * (columns - 1)) / columns);
  const exact = (n: number | null) => n === null ? '—' : new Intl.NumberFormat(i18n.language).format(n);
  const color = (n: number | null) => n === null || n === 0 ? FanColors.muted : n > 0 ? '#69d9a3' : '#ff8d9b';

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 20000);
    const base = process.env.EXPO_PUBLIC_ANALYTICS_API_URL || process.env.EXPO_PUBLIC_API_URL;
    void (async () => {
      try {
        if (!base) throw new Error('Missing API');
        const response = await fetch(`${base.replace(/\/+$/, '')}/api/analytics/youtube/growth`, { signal: controller.signal });
        if (!response.ok) throw new Error('Growth unavailable');
        const result: Growth = await response.json();
        if (!validGrowth(result) || result.channel_id !== data.channel.id) throw new Error('Invalid growth');
        if (active) setResult({ data, attempt: retry, growth: result, error: false });
      } catch { if (active) setResult({ data, attempt: retry, growth: null, error: true }); }
      finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [data, retry]);

  function period(p: Period | null | undefined) {
    if (!p) return null;
    const format = (d: string) => new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: preferences.timeZone }).format(new Date(d));
    return <View style={s.notes}>{p.partial && <Text style={s.note}>{w.partial}</Text>}<Text style={s.note}>{format(p.from)} → {format(p.to)} · {preferences.timeZone}</Text></View>;
  }
  function tile(label: string, n: number | null, delta = false, approximate = false) {
    return <View key={label} style={[s.tile, { width: tileWidth }]} accessible accessibilityLabel={`${label}: ${approximate ? w.approx : ''}${exact(n)}`}>
      <Text style={s.label}>{label}</Text>
      <Text style={[s.value, delta && { color: color(n) }]} adjustsFontSizeToFit numberOfLines={1}>{approximate ? '≈ ' : ''}{compactNumber(n, delta)}</Text>
      <Text style={s.note}>{delta && n !== null && n > 0 ? '+' : ''}{exact(n)}{delta && n === 0 ? ` · ${w.same}` : ''}</Text>
    </View>;
  }

  return <View style={s.root} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
    {width > 0 && <View style={s.grid}>
      {tile(w.subs, data.channel.subscriber_count, false, data.channel.subscriber_count_is_approximate)}
      {tile(w.views, data.channel.view_count)}{tile(w.videos, data.channel.video_count)}
    </View>}
    <Text style={s.heading}>{w.week}</Text>
    {busy && <ActivityIndicator color={FanColors.accent} />}
    {error && <View style={s.notes}><Text accessibilityRole="alert" style={s.note}>{w.error}</Text><Pressable accessibilityRole="button" onPress={() => setRetry(n => n + 1)} style={s.retry}><Text style={s.link}>{w.retry}</Text></Pressable></View>}
    {growth && <>
      {period(growth.channel)}
      {width > 0 && <View style={s.grid}>
        {tile(w.viewChange, growth.channel?.changes.view_count ?? null, true)}
        {tile(w.subChange, growth.channel?.changes.subscriber_count ?? null, true, true)}
        {tile(w.videoChange, growth.channel?.changes.video_count ?? null, true)}
      </View>}
      {(!growth.channel || Object.values(growth.channel.changes).every(v => v === null)) && <Text style={s.note}>{w.waiting}</Text>}
      <Text style={s.note}>{w.rounded}</Text>
      <Text style={s.heading}>{w.rank}</Text><Text style={s.note}>{w.scope}</Text>
      {period(growth.mv_period)}
      {growth.videos.length === 0 && <Text style={s.note}>{w.waiting}</Text>}
      {width > 0 && <View style={s.grid}>{growth.videos.slice(0, 6).map((v, index) => <Pressable key={v.id} accessibilityRole="link" accessibilityLabel={`${index + 1}. ${v.title}, ${exact(v.delta)}`} onPress={() => onOpenVideo(v.id)} style={[s.tile, s.mv, { width: tileWidth }]}>
        {v.thumbnail_url && !failed.includes(v.id) && <Image source={{ uri: v.thumbnail_url }} style={[s.thumbnail, { height: tileWidth * 0.28 }]} resizeMode="cover" onError={() => setFailed(ids => [...ids, v.id])} />}
        <Text numberOfLines={2} style={s.mvTitle}>{index + 1}. {v.title}</Text>
        <Text style={[s.delta, { color: color(v.delta) }]}>{compactNumber(v.delta, true)}</Text>
        <Text style={s.small}>{w.total} {compactNumber(v.view_count)}</Text>
      </Pressable>)}</View>}
      {growth.excluded > 0 && <Text style={s.note}>{w.excluded}</Text>}
    </>}
  </View>;
}

const s = StyleSheet.create({
  root: { gap: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { aspectRatio: 1, padding: 16, borderRadius: 20, backgroundColor: FanColors.surface, justifyContent: 'center', gap: 8 },
  label: { color: FanColors.muted, fontSize: 14 }, value: { color: FanColors.text, fontSize: 32, fontWeight: '800' },
  note: { color: FanColors.muted, fontSize: 12, lineHeight: 19 }, small: { color: FanColors.muted, fontSize: 11 },
  notes: { gap: 6 }, heading: { color: FanColors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  retry: { alignSelf: 'flex-start', padding: 12, backgroundColor: FanColors.surfaceAlt, borderRadius: 12 }, link: { color: FanColors.accent },
  mv: { padding: 10, justifyContent: 'flex-start', gap: 4 }, thumbnail: { width: '100%', borderRadius: 10 },
  mvTitle: { color: FanColors.text, fontSize: 12, lineHeight: 16, flexShrink: 1 }, delta: { fontSize: 22, fontWeight: '800' },
});
