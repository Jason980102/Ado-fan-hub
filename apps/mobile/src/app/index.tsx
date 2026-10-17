import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
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
  const w = hubCopy(i18n.resolvedLanguage || i18n.language);
  const router = useRouter();
  const layout = useWebLayout();
  const { preferences } = usePreferences();
  const feed = useNewsFeed();
  const [gridWidth, setGridWidth] = useState(0);
  const [linkError, setLinkError] = useState(false);
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
  async function open(url: string) {
    setLinkError(false);
    try {
      if (!/^https:\/\//i.test(url)) throw new Error('Invalid URL');
      await Linking.openURL(url);
    } catch { setLinkError(true); }
  }
  return <SafeAreaView style={s.screen} edges={Platform.OS === 'web' ? ['top'] : ['top', 'left', 'right']}>
    <RoseScrollView contentContainerStyle={[s.content, layout.contentStyle, Platform.OS === 'web' && { maxWidth: 1120 }]}
      showsVerticalScrollIndicator={false}
      refreshControl={Platform.OS !== 'web' ? <RefreshControl refreshing={feed.refreshing} onRefresh={() => void feed.loadNews(true)} tintColor={C.accent} colors={[C.accent]} /> : undefined}>
      <View style={s.brand}>
        <View style={s.brandCopy}><Text style={s.eyebrow}>{w.eyebrow}</Text><Text style={s.title}>Ado Fan Hub</Text></View>
        <Image source={require('../../assets/images/blue-rose-icon.png')} resizeMode="contain" style={s.rose} accessible={false} />
      </View>
      <View style={[s.hero, layout.wide && s.heroWide]}>
        <View style={[s.heroCopy, layout.wide && { flex: 1 }]}><Text style={s.eyebrow}>DISCOVER ADO</Text><Text style={s.heroTitle}>{w.hero}</Text><Text style={s.body}>{w.intro}</Text></View>
        <View style={s.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/about')} style={({ pressed }) => [s.primary, pressed && s.pressed]}><Text style={s.primaryText}>{w.about} →</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/mv')} style={({ pressed }) => [s.secondary, pressed && s.pressed]}><Text style={s.link}>{w.listen} →</Text></Pressable>
        </View>
      </View>
      <Text style={s.heading}>{w.shortcuts}</Text>
      <View style={s.grid} onLayout={e => setGridWidth(e.nativeEvent.layout.width)}>
        {Array.from({ length: Math.ceil(shortcuts.length / columns) }, (_, row) => (
          <View key={row} style={s.shortcutRow}>
            {shortcuts.slice(row * columns, (row + 1) * columns).map(item => (
              <Pressable key={item.route} accessibilityRole="button" onPress={() => router.push(item.route)}
                style={({ pressed }) => [s.shortcut, s.shortcutCell, pressed && s.pressed]}>
                <ExploreIcon name={item.icon} /><Text style={s.cardTitle}>{item.title}</Text><Text style={s.small}>{item.note}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <View style={s.sectionHeader}><Text style={s.heading}>{w.news}</Text><Pressable accessibilityRole="button" onPress={() => router.push('/news')} style={s.textButton}><Text style={s.link}>{w.all} →</Text></Pressable></View>
      {Platform.OS === 'web' && <Pressable disabled={feed.loading || feed.refreshing} accessibilityRole="button" onPress={() => void feed.loadNews(true)} style={s.refresh}><Text style={s.link}>{w.refresh}</Text></Pressable>}
      {feed.loading && <ActivityIndicator color={C.accent} />}
      {feed.error && <View style={s.newsCard}><Text accessibilityRole="alert" style={s.body}>{w.error}</Text><Pressable accessibilityRole="button" onPress={() => void feed.loadNews()} style={s.textButton}><Text style={s.link}>{w.retry}</Text></Pressable></View>}
      {!feed.loading && !feed.error && feed.items.length === 0 && <Text style={s.body}>{w.empty}</Text>}
      {feed.items.slice(0, 3).map(item => <Pressable accessibilityRole="link" key={item.id} onPress={() => void open(item.source_url)} style={({ pressed }) => [s.newsCard, pressed && s.pressed]}>
        <View style={s.newsRow}>
          <View style={s.newsCopy}><Text style={s.newsMeta}>{date(item.published_at)} · {item.source_name}</Text><Text style={s.newsTitle} numberOfLines={3}>{item.title}</Text><Text style={s.link}>↗ {item.source_name}</Text></View>
          {item.image_url && /^https:\/\//i.test(item.image_url) && !feed.failedImages.includes(item.id) && <Image source={{ uri: item.image_url }} resizeMode="cover" style={s.thumbnail} onError={() => feed.setFailedImages(ids => [...ids, item.id])} />}
        </View>
      </Pressable>)}
      {linkError && <Text accessibilityRole="alert" style={s.body}>{w.linkError}</Text>}
      <Pressable accessibilityRole="button" onPress={() => router.push('/about')} style={({ pressed }) => [s.aboutCard, pressed && s.pressed]}>
        <Text style={s.eyebrow}>BEHIND THE MUSIC</Text><Text style={s.heading}>{w.about} →</Text><Text style={s.body}>{w.aboutNote}</Text>
      </Pressable>
      <Text style={s.footer}>{w.footer}</Text>
    </RoseScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { width: '100%', maxWidth: 850, alignSelf: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'web' ? 110 : 24, paddingBottom: 110, gap: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brandCopy: { flex: 1, gap: 10 }, rose: { width: 72, height: 72 },
  title: { color: C.text, fontSize: 30, fontWeight: '800' }, eyebrow: { color: C.accent, fontWeight: '700', fontSize: 11, letterSpacing: 1.6 },
  hero: { padding: 24, backgroundColor: C.surfaceAlt, borderRadius: 24, gap: 24 }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 32 }, heroCopy: { gap: 12 },
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
