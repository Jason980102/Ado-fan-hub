import { useRoseMotion } from '@/contexts/rose-motion-context';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Platform, Pressable,
  RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import '@/localization/analytics-i18n';
import { usePreferences } from '@/contexts/preferences-context';
import {
  getAnalytics,
  getChannelAvatarUrl,
  getChannelHistory,
  type AnalyticsResponse,
  type ChannelHistoryResponse,
} from '@/services/analytics-api';
import HistoryChangeChart from '@/components/history-change-chart';
import AnimatedNumber from '@/components/animated-number';
import { useFocusEffect } from 'expo-router';
import MvBarChart from '@/components/mv-bar-chart';
import CollapsibleSection from '@/components/collapsible-section';

export default function AnalyticsScreen() {
  const { restartGrowth } = useRoseMotion();
  const webLayout = useWebLayout();
  const { t, i18n } = useTranslation('analytics');
  const { preferences } = usePreferences();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const request = useRef<AbortController | null>(null);
  const [history, setHistory] = useState<ChannelHistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [pageFocused, setPageFocused] = useState(false);
  const [ranking, setRanking] =
    useState<'all' | 'original' | 'cover'>('all');

  useFocusEffect(
    useCallback(() => {
      setPageFocused(true);
      return () => setPageFocused(false);
    }, [])
  );

  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);

    return getAnalytics(controller.signal)
      .then((result) => {
        if (request.current !== controller || controller.signal.aborted) {
          return;
        }

        setData(result);
        setError(false);
        setFailedImages([]);
        setHistoryError(false);

        return getChannelHistory(controller.signal, days)
          .then((resultHistory) => {
            if (request.current !== controller || controller.signal.aborted) {
              return;
            }

            if (resultHistory.channel_id !== result.channel.id) {
              throw new Error('History channel mismatch');
            }

            setHistory(resultHistory);
          })
          .catch(() => {
            if (request.current === controller) {
              setHistory(null);
              setHistoryError(true);
            }
          });
      })
      .catch(() => {
        if (request.current === controller) {
          setError(true);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        if (request.current === controller) {
          setBusy(false);
          request.current = null;
        }
      });
  }, [days]);

  function refresh() {
    if (busy) return;
    restartGrowth('refresh');
    setBusy(true);
    setError(false);
    void load();
  }

  useEffect(() => {
    void load();
    return () => {
      const active = request.current;
      request.current = null;
      active?.abort();
    };
  }, [load]);

  function number(value: number | null) {
    return value === null
      ? t('unknown')
      : new Intl.NumberFormat(i18n.language).format(value);
  }

  function date(value: string, includeTime = false) {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric', month: 'short', day: 'numeric',
        ...(includeTime ? { hour: '2-digit', minute: '2-digit' } as const : {}),
        timeZone: preferences.timeZone,
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  function historyTime(timestamp: number) {
    try {
      return new Intl.DateTimeFormat(i18n.language, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: preferences.timeZone,
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toISOString();
    }
  }

  async function openVideo(id: string) {
    setLinkError(false);
    try {
      await Linking.openURL(`https://www.youtube.com/watch?v=${id}`);
    } catch {
      setLinkError(true);
    }
  }

  const rankedVideos = (data?.videos ?? [])
    .filter((video) =>
      ranking === 'all' || video.categories.includes(ranking)
    )
    .filter((video) => video.view_count !== null)
    .sort((a, b) =>
      (b.view_count ?? 0) - (a.view_count ?? 0) ||
      a.id.localeCompare(b.id)
    )
    .slice(0, 10);

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView
        contentContainerStyle={[styles.content, webLayout.contentStyle]}
        refreshControl={
          <RefreshControl
            refreshing={busy && data !== null}
            onRefresh={refresh}
            tintColor={FanColors.accent}
            colors={[FanColors.accent]}
          />
        }
      >
        <Text style={styles.accent}>ADO FAN HUB</Text>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.muted}>{t('subtitle')}</Text>
        {Platform.OS === 'web' && (
<Pressable
          accessibilityRole="button"
          style={styles.button}
          disabled={busy}
          onPress={refresh}
        >
          <Text style={styles.accent}>{busy ? t('loading') : t('refresh')}</Text>
        </Pressable>
)}

        {busy && !data && <ActivityIndicator color={FanColors.accent} size="large" />}

        {error && (
          <View style={styles.card}>
            <Text accessibilityRole="alert" style={styles.muted}>{t('error')}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void load()}
            >
              <Text style={styles.accent}>{t('retry')}</Text>
            </Pressable>
          </View>
        )}

        {data && (
          <>
            <View style={styles.channelHeader}>
              {data.channel.avatar_url && !failedImages.includes('channel-avatar') ? (
                <Image
                  source={{
                    uri: Platform.OS === 'web'
                      ? getChannelAvatarUrl()
                      : data.channel.avatar_url,
                  }}
                  style={styles.avatar}
                  resizeMode="cover"
                  accessibilityLabel={`${data.channel.title} YouTube`}
                  onError={() => setFailedImages((current) =>
                    current.includes('channel-avatar')
                      ? current
                      : [...current, 'channel-avatar']
                  )}
                />
              ) : (
                <View style={[styles.avatar, styles.fallback]}>
                  <Text style={styles.heading}>Ado</Text>
                </View>
              )}
              <Text style={[styles.heading, styles.channelTitle]}>
                {data.channel.title} · YouTube
              </Text>
            </View>
            <View style={styles.stats}>
              {[
                ['subscribers', data.channel.subscriber_count],
                ['views', data.channel.view_count],
                ['videos', data.channel.video_count],
              ].map(([key, value]) => (
                <View key={String(key)} style={[styles.card, styles.stat]}>
                  <Text style={styles.muted}>{t(String(key))}</Text>
                  {pageFocused && (
                    <AnimatedNumber
                      value={value as number | null}
                      formatNumber={number}
                      style={styles.value}
                      prefix={
                        key === 'subscribers' &&
                          data.channel.subscriber_count !== null &&
                          data.channel.subscriber_count_is_approximate
                          ? `${t('approx')} `
                          : ''
                      }
                    />
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.muted}>
              {t('updated')}: {date(data.fetched_at, true)}
              {' · '}{preferences.timeZone}
              {'\n'}{data.cached ? t('cache') : t('fresh')}
            </Text>
            <Text style={styles.muted}>{t('note')}</Text>
            <CollapsibleSection
              title={t('historyTitle', { days })}
              active={pageFocused}
            >
              <View style={styles.rangeRow}>
                {([7, 30, 90] as const).map((range) => (
                  <Pressable
                    key={range}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: days === range,
                      disabled: busy,
                    }}
                    disabled={busy}
                    style={[
                      styles.rangeButton,
                      days === range && styles.rangeSelected,
                    ]}
                    onPress={() => {
                      if (days === range) return;
                      setHistory(null);
                      setHistoryError(false);
                      setBusy(true);
                      setDays(range);
                    }}
                  >
                    <Text style={styles.accent}>
                      {t('historyRange', { days: range })}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {busy && !history && (
                <ActivityIndicator color={FanColors.accent} />
              )}
              <Text style={styles.muted}>{t('historyChangesNote')}</Text>
              <Text style={styles.muted}>{preferences.timeZone}</Text>
              {history?.truncated && (
                <Text style={styles.muted}>{t('historyTruncated')}</Text>
              )}
              {historyError && (
                <Text accessibilityRole="alert" style={styles.muted}>
                  {t('historyError')}
                </Text>
              )}
              {history && (
                <>
                  <HistoryChangeChart
                    title={t('subscribers')}
                    approximate={true}
                    points={history.points.map((point) => ({
                      timestamp: Date.parse(point.fetched_at),
                      value: point.subscriber_count,
                    }))}
                    emptyLabel={t('unknown')}
                    formatNumber={number}
                    formatTime={historyTime}
                    timeZone={preferences.timeZone}
                  />
                  <HistoryChangeChart
                    title={t('views')}
                    points={history.points.map((point) => ({
                      timestamp: Date.parse(point.fetched_at),
                      value: point.view_count,
                    }))}
                    emptyLabel={t('unknown')}
                    formatNumber={number}
                    formatTime={historyTime}
                    timeZone={preferences.timeZone}
                  />
                </>
              )}
            </CollapsibleSection>
            <CollapsibleSection
              title={t('rankingTitle')}
              active={pageFocused}
            >
              <Text style={styles.muted}>{t('rankingScope')}</Text>
              <View style={styles.rangeRow}>
                {([
                  ['all', 'rankingAll'],
                  ['original', 'rankingOriginal'],
                  ['cover', 'rankingCover'],
                ] as const).map(([category, label]) => (
                  <Pressable
                    key={category}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ranking === category }}
                    onPress={() => setRanking(category)}
                    style={[
                      styles.rangeButton,
                      ranking === category && styles.rangeSelected,
                    ]}
                  >
                    <Text style={styles.accent}>{t(label)}</Text>
                  </Pressable>
                ))}
              </View>
              {pageFocused && (
                <MvBarChart
                  key={ranking}
                  videos={rankedVideos}
                  title={t(
                    ranking === 'all'
                      ? 'rankingAll'
                      : ranking === 'original'
                        ? 'rankingOriginal'
                        : 'rankingCover'
                  )}
                  emptyLabel={t('empty')}
                  viewsLabel={t('videoViews')}
                  formatNumber={number}
                  onSelect={(id) => void openVideo(id)}
                />
              )}
              {data.unavailable_video_ids.length > 0 && (
                <Text style={styles.muted}>{t('missing')}</Text>
              )}
              {rankedVideos.length === 0 && (
                <Text style={styles.muted}>{t('empty')}</Text>
              )}
              {linkError && (
                <Text accessibilityRole="alert" style={styles.muted}>{t('linkError')}</Text>
              )}

            </CollapsibleSection>

            {linkError && (
              <Text accessibilityRole="alert" style={styles.muted}>
                {t('linkError')}
              </Text>
            )}
            <Text style={styles.muted}>{t('source')}: {data.source}</Text>
          </>
        )}
        <Text style={styles.footer}>{i18n.t('homeFooter')}</Text>
      </RoseScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FanColors.background },
  content: {
    width: '100%', maxWidth: 850, alignSelf: 'center',
    padding: 24, paddingTop: Platform.OS === 'web' ? 100 : 24,
    paddingBottom: 110, gap: 16,
  },
  title: { color: FanColors.text, fontSize: 34, fontWeight: '800' },
  heading: { color: FanColors.text, fontSize: 18, fontWeight: '700' },
  accent: { color: FanColors.accent, fontWeight: '600' },
  muted: { color: FanColors.muted, fontSize: 14, lineHeight: 22 },
  button: {
    alignSelf: 'flex-end', padding: 12,
    borderRadius: 12, backgroundColor: FanColors.surfaceAlt,
  },
  card: { backgroundColor: FanColors.surface, borderRadius: 20, padding: 20, gap: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: 200 },
  value: { color: FanColors.text, fontSize: 24, fontWeight: '700', flexShrink: 1 },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: FanColors.surfaceAlt },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  footer: { color: FanColors.subtle, textAlign: 'center', fontSize: 11, marginTop: 20 },
  channelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: FanColors.surfaceAlt,
  },
  channelTitle: {
    flex: 1,
  },
  rangeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  rangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: FanColors.surface,
    borderWidth: 1,
    borderColor: FanColors.border,
  },
  rangeSelected: {
    backgroundColor: FanColors.selected,
    borderColor: FanColors.accent,
  },
});
