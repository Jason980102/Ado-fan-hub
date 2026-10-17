import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import RoseScrollView from '@/components/rose-scroll-view';
import OfficialLinkImage from '@/components/official-link-image';
import { FanColors as C } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import { hubCopy, milestoneDates, profileSources } from '@/localization/hub-copy';

export default function AboutScreen() {
  const { i18n } = useTranslation();
  const w = hubCopy(i18n.resolvedLanguage || i18n.language);
  const router = useRouter();
  const layout = useWebLayout();
  const [error, setError] = useState(false);
  async function open(url: string) {
    setError(false);
    try { await Linking.openURL(url); } catch { setError(true); }
  }
  return <SafeAreaView style={s.screen} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
    <RoseScrollView contentContainerStyle={[s.content, layout.contentStyle, Platform.OS === 'web' && { maxWidth: 960 }]}>
      <Text style={s.eyebrow}>ARTIST PROFILE</Text>
      <View style={s.identity}><OfficialLinkImage source="x" /><View style={s.name}><Text style={s.title}>Ado</Text><Text style={s.muted}>{w.biography}</Text></View></View>
      <View style={s.card}><Text style={s.body}>{w.bio}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/mv')} style={s.button}><Text style={s.link}>{w.listen} →</Text></Pressable>
      </View>
      <Text style={s.heading}>{w.facts}</Text>
      <View style={s.card}>{[[w.birthday, '2002.10.24'], [w.hometown, w.tokyo], [w.debut, '2020.10.23']].map(([label, value]) =>
        <View key={label} style={s.fact}><Text style={s.muted}>{label}</Text><Text style={s.factValue}>{value}</Text></View>)}</View>
      <Text style={s.heading}>{w.journey}</Text>
      <View style={s.card}>{milestoneDates.map((date, index) => <View key={date} style={s.milestone}>
        <View style={s.dot} /><View style={s.milestoneCopy}><Text style={s.eyebrow}>{date}</Text><Text style={s.body}>{w.releases[index]}</Text></View>
      </View>)}</View>
      <Text style={s.heading}>{w.sources}</Text><Text style={s.muted}>{w.sourceNote}</Text>
      {profileSources.map(source => <Pressable accessibilityRole="link" key={source.url} onPress={() => void open(source.url)} style={s.source}><Text style={s.link}>{source.title} ↗</Text></Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => router.push('/explore')} style={s.source}><Text style={s.link}>{w.official} →</Text></Pressable>
      {error && <Text accessibilityRole="alert" style={s.muted}>{w.linkError}</Text>}
      <Text style={s.footer}>{w.footer}</Text>
    </RoseScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.background }, content: { padding: 24, paddingTop: Platform.OS === 'web' ? 110 : 24, paddingBottom: 110, gap: 20, width: '100%', maxWidth: 850, alignSelf: 'center' },
  identity: { flexDirection: 'row', gap: 18, alignItems: 'center' }, name: { flex: 1, gap: 4 }, title: { color: C.text, fontSize: 44, fontWeight: '800' },
  eyebrow: { color: C.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.3 }, heading: { color: C.text, fontSize: 22, fontWeight: '700' },
  body: { color: C.text, fontSize: 16, lineHeight: 27 }, muted: { color: C.muted, fontSize: 14, lineHeight: 23 },
  card: { backgroundColor: C.surface, padding: 24, gap: 24, borderRadius: 22 }, button: { padding: 14, backgroundColor: C.selected, borderRadius: 12, alignSelf: 'flex-start' },
  link: { color: C.accent, fontSize: 14, fontWeight: '600' }, fact: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }, factValue: { color: C.text, fontSize: 16, fontWeight: '600' },
  milestone: { flexDirection: 'row', gap: 16 }, milestoneCopy: { flex: 1, gap: 6 }, dot: { width: 8, height: 8, marginTop: 5, borderRadius: 4, backgroundColor: C.accent },
  source: { padding: 16, borderRadius: 14, backgroundColor: C.surface }, footer: { color: C.subtle, fontSize: 11, textAlign: 'center', marginTop: 12 },
});
