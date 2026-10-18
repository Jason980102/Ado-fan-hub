import { compactNumber } from '@/components/analytics-overview';
import { useHomeRanking } from '@/hooks/use-home-ranking';
import { getAnalytics } from '@/services/analytics-api';
import HomeMvRankings from '@/components/home-mv-rankings';
import { HeroGeometry, MotionShortcut } from '@/components/home-motion';
import { useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import RoseScrollView from '@/components/rose-scroll-view';
import ExploreIcon from '@/components/explore-icon';
import { FanColors as C } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import { useNewsFeed } from '@/hooks/use-news-feed';
import { usePreferences } from '@/contexts/preferences-context';
import { hubCopy } from '@/localization/hub-copy';

export default function HomeScreen() {
  const { i18n } = useTranslation();
  const { t } = useTranslation('analytics');
  const totals = useHomeRanking(getAnalytics);
  const channel = totals.current?.data?.channel;
  const subscribers = channel?.subscriber_count;
  const subscriberCount = subscribers == null ? t('unknown')
    : compactNumber(subscribers);
  const w = hubCopy(i18n.resolvedLanguage || i18n.language);
  const router = useRouter();
  const layout = useWebLayout();
  const { preferences } = usePreferences();
  const feed = useNewsFeed();
  const [gridWidth, setGridWidth] = useState(0);
  const [heroSize, setHeroSize] = useState({ width: 0, height: 0 });
  const columns = Platform.OS === 'web' ? (gridWidth >= 960 ? 4 : gridWidth >= 280 ? 2 : 1) : 2;
  const shortcuts = [
    { title: w.news, note: w.newsNote, icon: 'video', route: '/news' },
    { title: 'MV', note: w.mvNote, icon: 'music', route: '/mv' },
    { title: w.analytics, note: w.analyticsNote, icon: 'chart', route: '/analytics' },
    { title: w.official, note: w.officialNote, icon: 'shop', route: '/explore' },
  ] as const;
  function date(value: string) {
    if (!Number.isFinite(Date.parse(value))) return '';
    return new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', timeZone: preferences.timeZone }).format(new Date(value));
  }
  function openNewsArticle(item: (typeof feed.items)[number]) {
    router.push({
      pathname: '/news-article',
      params: {
        title: item.title,
        published_at: item.published_at,
        source_name: item.source_name,
        source_url: item.source_url,
        image_url: item.image_url ?? '',
      },
    });
  }
  const subscriberBadge = (
            <View style={[s.subscriberBadge, Platform.OS === 'web' && s.subscriberBadgeWeb]}>
              <Text style={s.subscriberLabel} numberOfLines={1} adjustsFontSizeToFit>YouTube · {t('subscribers')}</Text>
              {!totals.current ? <ActivityIndicator color={C.accent} accessibilityLabel={t('loading')} />
                : totals.current.error ? <Pressable accessibilityRole="button" accessibilityLabel={`${t('error')} ${t('retry')}`} onPress={totals.retry} style={s.subscriberRetry}>
                    <Text accessibilityRole="alert" style={s.subscriberValue}>{t('unknown')} · {t('retry')}</Text>
                  </Pressable>
                : <Text style={s.subscriberValue} numberOfLines={1} adjustsFontSizeToFit>{subscriberCount}</Text>}
            </View>
  );
  return <SafeAreaView style={s.screen} edges={Platform.OS === 'web' ? ['top'] : ['top', 'left', 'right']}>
    <RoseScrollView contentContainerStyle={[s.content, layout.contentStyle, Platform.OS === 'web' && { maxWidth: 1120 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={feed.refreshing} onRefresh={() => void feed.loadNews(true)} tintColor={C.accent} colors={[C.accent]} /> : undefined}>
      <View style={s.brandCopy}>
        <View style={s.brand}>
          <Image source={require('../../assets/images/blue-rose-icon.png')} resizeMode="contain" style={s.rose} accessible={false} />
          <Text style={[s.title, { flex: 1 }]}>Ado Fan Hub</Text>
        </View>
      </View>
      <View style={[s.hero, layout.wide && s.heroWide]}
        onLayout={Platform.OS !== 'web' ? event => {
          const { width, height } = event.nativeEvent.layout;
          setHeroSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
        } : undefined}>
        <Image source={require('../../assets/images/tokyo-night-banner.png')}
          resizeMode="cover"
          style={Platform.OS === 'web'
            ? [StyleSheet.absoluteFill, { width: '100%', height: '100%' }]
            : { position: 'absolute', top: 0, left: 0, width: heroSize.width, height: heroSize.height }}
          accessible={false} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(3,9,22,0.58)' }]} />
        <HeroGeometry />
        <View style={[s.heroCopy, layout.wide && { flex: 1 }]}>
          <Text style={[s.eyebrow, s.heroEyebrow]}>ADO NOW</Text>
          <View style={s.heroTitleRow}>
            <Text style={[s.heroTitle, s.heroTitleText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{w.nowTitle}</Text>
            {Platform.OS !== 'web' && subscriberBadge}
          </View>
          <Text style={[s.body, s.heroBody]}>{w.nowIntro}</Text>
          <View style={s.heroNews}>
            {feed.loading ? (
              <ActivityIndicator color={C.accent} />
            ) : feed.error ? (
              <Text style={s.heroBody}>{w.error}</Text>
            ) : feed.items.length === 0 ? (
              <Text style={s.heroBody}>{w.empty}</Text>
            ) : feed.items.slice(0, 3).map(item => (
              <Pressable key={item.id} accessibilityRole="button"
                onPress={() => openNewsArticle(item)}
                style={({ pressed }) => [s.heroNewsItem, pressed && s.pressed]}>
                <Text style={s.heroNewsMeta}>{date(item.published_at)} · {item.source_name}</Text>
                <Text style={s.heroNewsTitle} numberOfLines={2}>{item.title}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/news')}
            style={s.heroAll}>
            <Text style={s.heroLink}>{w.all} →</Text>
          </Pressable>
        </View>
        <View style={Platform.OS === 'web' ? s.heroActionColumn : undefined}>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/about')} style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>{w.about} →</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/mv')} style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.link}>{w.listen} →</Text></Pressable>
        </View>
          {Platform.OS === 'web' && subscriberBadge}
        </View>
      </View>
      <Text style={s.heading}>{w.shortcuts}</Text>
      <View style={s.grid} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
        {Array.from({ length: Math.ceil(shortcuts.length / columns) }, (_, row) => (
          <View key={row} style={s.shortcutRow}>
            {shortcuts.slice(row * columns, (row + 1) * columns).map((item, column) => (
              <MotionShortcut key={item.route} index={row * columns + column}
                onPress={() => router.push(item.route)} style={s.shortcut}>
                <ExploreIcon name={item.icon} /><Text style={s.cardTitle}>{item.title}</Text><Text style={s.small}>{item.note}</Text>
              </MotionShortcut>
            ))}
          </View>
        ))}
      </View>
      <HomeMvRankings totals={totals} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/about')} style={({ pressed }) => [s.aboutCard, pressed && s.pressed]}>
        <Text style={s.eyebrow}>BEHIND THE MUSIC</Text><Text style={s.heading}>{w.about} →</Text><Text style={s.body}>{w.aboutNote}</Text>
      </Pressable>
       <View style={s.sectionHeader}>
         <Text style={s.heading}>{w.news}</Text>
         <Pressable accessibilityRole="button" onPress={() => router.push('/news')} style={s.textButton}>
           <Text style={s.link}>{w.all} →</Text>
         </Pressable>
       </View>
       {Platform.OS === 'web' && (
         <Pressable disabled={feed.loading || feed.refreshing} accessibilityRole="button"
           onPress={() => void feed.loadNews(true)} style={s.refresh}>
           <Text style={s.link}>{w.refresh}</Text>
         </Pressable>
       )}
       {feed.loading && <ActivityIndicator color={C.accent} />}
       {feed.error && <View style={s.newsCard}>
         <Text accessibilityRole="alert" style={s.body}>{w.error}</Text>
         <Pressable accessibilityRole="button" onPress={() => void feed.loadNews()} style={s.textButton}>
           <Text style={s.link}>{w.retry}</Text>
         </Pressable>
       </View>}
       {!feed.loading && !feed.error && feed.items.length === 0 && <Text style={s.body}>{w.empty}</Text>}
       {feed.items.slice(0, 10).map(item => (
         <Pressable accessibilityRole="button" key={item.id}
           onPress={() => openNewsArticle(item)}
           style={({ pressed }) => [s.newsCard, pressed && s.pressed]}>
           <View style={s.newsRow}>
             <View style={s.newsCopy}>
               <Text style={s.newsMeta}>{date(item.published_at)} · {item.source_name}</Text>
               <Text style={s.newsTitle} numberOfLines={3}>{item.title}</Text>
               <Text style={s.link}>{w.news} →</Text>
             </View>
             {item.image_url && /^https:\/\//i.test(item.image_url) && !feed.failedImages.includes(item.id) && (
               <Image source={{ uri: item.image_url }} resizeMode="cover"
                 style={s.thumbnail}
                 onError={() => feed.setFailedImages(ids => ids.includes(item.id) ? ids : [...ids, item.id])} />
             )}
           </View>
         </Pressable>
       ))}
       <Pressable accessibilityRole="button" onPress={() => router.push('/news')} style={s.bottomAll}>
         <Text style={s.link}>{w.all} →</Text>
       </Pressable>
      <Text style={s.footer}>{w.footer}</Text>
    </RoseScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  heroActionColumn: { gap: 16, alignItems: 'flex-start', maxWidth: '100%' },
  subscriberBadgeWeb: { maxWidth: '100%', alignSelf: 'flex-start' },
  heroTitleRow: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroTitleText: { flex: 1, minWidth: 0 },
  subscriberBadge: { borderWidth: 1, borderColor: '#7fb8f0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(5,15,35,0.78)', gap: 4, maxWidth: '46%', flexShrink: 1 },
  subscriberLabel: { color: '#c0d8fa', fontSize: 11, lineHeight: 16 },
  subscriberValue: { color: '#ffffff', fontSize: 17, lineHeight: 23, fontWeight: '700' },
  subscriberRetry: { paddingVertical: 4 },
  heroEyebrow: { color: '#b9d7ff', letterSpacing: 0.8 },
  heroBody: { color: '#e0e9f7' },
  heroNews: { gap: 8 },
  heroNewsItem: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(5, 15, 35, 0.73)', gap: 3 },
  heroNewsMeta: { color: '#c0d8fa', fontSize: 11 },
  heroNewsTitle: { color: '#ffffff', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  heroAll: { alignSelf: 'flex-start', paddingVertical: 6 },
  heroLink: { color: '#c8e5ff', fontWeight: '700', fontSize: 13 },
  bottomAll: { alignSelf: 'center', padding: 12 },
  screen: { flex: 1, backgroundColor: C.background }, content: { width: '100%', maxWidth: 850, alignSelf: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 110 : 24, paddingBottom: 110, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brandCopy: { gap: 10 }, rose: { width: 44, height: 44 },
  title: { color: C.text, fontSize: 30, fontWeight: '800' }, eyebrow: { color: C.accent, fontWeight: '700', fontSize: 11, letterSpacing: 1.6 },
  hero: { padding: 24, paddingVertical: 36, minHeight: 290, backgroundColor: C.surfaceAlt, borderRadius: 24, gap: 24, overflow: 'hidden', justifyContent: 'center' }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 32, minHeight: 320, padding: 36 }, heroCopy: { gap: 12 },
  heroTitle: { color: C.text, fontSize: 28, lineHeight: 37, fontWeight: '800' }, body: { color: C.muted, fontSize: 14, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, primary: { paddingHorizontal: 18, paddingVertical: 14, backgroundColor: C.accent, borderRadius: 12 }, primaryText: { color: C.background, fontSize: 14, fontWeight: '700' },
  secondary: { paddingHorizontal: 18, paddingVertical: 14, backgroundColor: C.surface, borderRadius: 12 }, link: { color: C.accent, fontSize: 13, fontWeight: '600' },
  heading: { color: C.text, fontSize: 21, fontWeight: '700' }, grid: { gap: 12 },
  shortcutRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  shortcutCell: { flex: 1, minWidth: 0 },
  shortcut: { padding: 18, gap: 10, minHeight: 148, borderRadius: 20, backgroundColor: C.surface }, cardTitle: { color: C.text, fontSize: 17, fontWeight: '700' }, small: { color: C.muted, fontSize: 12, lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, textButton: { paddingVertical: 12, paddingHorizontal: 4, alignSelf: 'flex-start' }, refresh: { alignSelf: 'flex-end', padding: 12, borderRadius: 12, backgroundColor: C.surfaceAlt },
  newsCard: { borderRadius: 20, backgroundColor: C.surface, padding: 20, gap: 8 }, newsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 }, newsCopy: { flex: 1, minWidth: 0, gap: 10 }, newsMeta: { color: C.muted, fontSize: 11, lineHeight: 17 }, newsTitle: { color: C.text, fontWeight: '600', fontSize: 16, lineHeight: 24 }, thumbnail: { width: 64, height: 64, borderRadius: 12 },
  aboutCard: { backgroundColor: C.surfaceAlt, borderRadius: 22, padding: 24, gap: 12 }, footer: { color: C.subtle, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 8 }, pressed: { opacity: 0.75 },
});
