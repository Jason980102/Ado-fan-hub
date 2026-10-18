import { useHomeRanking, type Result } from '@/hooks/use-home-ranking';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FanColors as C } from '@/constants/fan-theme';
import { usePreferences } from '@/contexts/preferences-context';
import { useDashboardWords } from '@/components/analytics-overview';
import { rankMvVideos, type AnalyticsResponse } from '@/services/analytics-api';
import { getGrowth, type Growth } from '@/services/analytics-growth-api';
import '@/localization/analytics-i18n';

export default function HomeMvRankings({ totals }: {
  totals: { current: Result<AnalyticsResponse> | null; retry: () => void };
}) {
  const growth = useHomeRanking<Growth>(getGrowth);
  const { t, i18n } = useTranslation('analytics');
  const w = useDashboardWords();
  const router = useRouter();
  const { preferences } = usePreferences();
  const [failed, setFailed] = useState<string[]>([]);
  const lang = i18n.resolvedLanguage || i18n.language;
  const all = lang.startsWith('zh') ? '查看完整排行' : lang.startsWith('ja') ? 'すべての順位' : 'Full ranking';
  const preview = lang.startsWith('zh') ? '前三名' : lang.startsWith('ja') ? '上位3曲' : 'Top 3';
  const format = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: preferences.timeZone,
  }).format(new Date(value));
  const top = rankMvVideos(totals.current?.data?.videos ?? []).slice(0, 3);
  function rows(videos: { id: string; title: string; thumbnail_url: string | null; view_count: number | null; delta?: number }[], signed: boolean) {
    return videos.map((video, index) => {
      const delta = video.delta ?? 0;
      const deltaStyle = delta > 0 ? s.positive : delta < 0 ? s.negative : s.neutral;

      return <View key={video.id} style={s.row}>
        <Text style={s.rank}>{index + 1}</Text>
        {video.thumbnail_url && !failed.includes(video.id)
          ? <Image source={{ uri: video.thumbnail_url }} resizeMode="cover" style={s.thumbnail}
              accessibilityLabel={video.title} onError={() => setFailed(ids => ids.includes(video.id) ? ids : [...ids, video.id])} />
          : <View style={[s.thumbnail, s.fallback]}><Text style={s.note}>MV</Text></View>}
        <View style={s.copy}>
          <Text numberOfLines={2} style={s.title}>{video.title}</Text>
          <Text style={s.note}>{signed ? w.viewChange : w.total}</Text>
        </View>
        <Text style={[s.metric, signed ? deltaStyle : s.neutral]} numberOfLines={1}>
          {signed ? `${delta > 0 ? '+' : ''}${format(delta)}` : format(video.view_count ?? 0)}
        </Text>
      </View>;
    });
  }
  function status(result: Result<unknown> | null, retry: () => void) {
    return !result ? <View style={s.status}><ActivityIndicator color={C.accent} /><Text style={s.note}>{t('loading')}</Text></View>
      : result.error ? <View style={s.status}><Text accessibilityRole="alert" style={s.note}>{t('error')}</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={s.button}><Text style={s.link}>{t('retry')}</Text></Pressable></View> : null;
  }
  return <>
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{w.rank} · {preview}</Text>
      {status(growth.current, growth.retry)}
      {growth.current?.data && <>
        <Text style={s.note}>{w.scope}</Text>
        {growth.current.data.mv_period && <>
          {growth.current.data.mv_period.partial && <Text style={s.note}>{w.partial}</Text>}
          <Text style={s.note}>{date(growth.current.data.mv_period.from)} → {date(growth.current.data.mv_period.to)} · {preferences.timeZone}</Text>
        </>}
        {growth.current.data.mv_period && growth.current.data.videos.length ? rows(growth.current.data.videos.slice(0, 3), true) : <Text style={s.note}>{w.waiting}</Text>}
        {growth.current.data.excluded > 0 && <Text style={s.note}>{w.excluded}</Text>}
      </>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/analytics')} style={s.button}><Text style={s.link}>{all} →</Text></Pressable>
    </View>
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.heading}>{t('rankingTitle')} · {preview}</Text>
      {status(totals.current, totals.retry)}
      {totals.current?.data && <>
        {top.length ? rows(top, false) : <Text style={s.note}>{t('empty')}</Text>}
        {totals.current.data.unavailable_video_ids.length > 0 && <Text style={s.note}>{t('missing')}</Text>}
      </>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/analytics')} style={s.button}><Text style={s.link}>{all} →</Text></Pressable>
    </View>
  </>;
}
const s = StyleSheet.create({
  card: { padding: 18, borderRadius: 20, backgroundColor: C.surface, gap: 14 },
  heading: { color: C.text, fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { color: C.accent, fontSize: 20, fontWeight: '800', width: 24, textAlign: 'center' },
  thumbnail: { width: 80, aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: C.surfaceAlt },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 5 }, title: { color: C.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  metric: { fontSize: 12, fontWeight: '700', flexShrink: 0, textAlign: 'right' },
  positive: { color: '#4ADE80' },
  negative: { color: '#F87171' },
  neutral: { color: C.muted },
  note: { color: C.muted, fontSize: 12, lineHeight: 19 },
  status: { gap: 8 }, button: { paddingVertical: 10, alignSelf: 'flex-start' }, link: { color: C.accent, fontSize: 13, fontWeight: '600' },
});
