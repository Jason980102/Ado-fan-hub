import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import ExploreIcon from '@/components/explore-icon';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AnimatedPressable from '@/components/animated-pressable';

const translations = {
  zh: {
    title: '探索', subtitle: '探索 Ado 的音樂、數據與官方資訊。',
    analytics: '數據分析', analyticsNote: '訂閱趨勢、頻道觀看數與 MV 排行榜',
    mv: '所有 MV', mvNote: '原唱與 Cover，搜尋你想聽的歌曲',
    official: '官方入口', external: '開啟官方網站 ↗',
    member: '官方會員網站', shop: '官方周邊商店',
    note: '本 App 為非官方粉絲專案。會員登入與購買由官方網站處理。',
    error: '無法開啟連結，請稍後重試。',
  },
  en: {
    title: 'Explore', subtitle: 'Explore Ado’s music, statistics and official updates.',
    analytics: 'Analytics', analyticsNote: 'Subscribers, channel views and MV rankings',
    mv: 'All MVs', mvNote: 'Find original songs and covers',
    official: 'Official links', external: 'Open official website ↗',
    member: 'Official fan club', shop: 'Official merchandise shop',
    note: 'An unofficial fan project. Membership sign-in and purchases are handled on official websites.',
    error: 'Unable to open the link. Please try again.',
  },
  ja: {
    title: '探索', subtitle: 'Adoの音楽、データ、公式情報を探す。',
    analytics: 'データ分析', analyticsNote: '登録者数の推移、総再生回数、MVランキング',
    mv: 'すべてのMV', mvNote: 'オリジナル曲とカバーを検索',
    official: '公式リンク', external: '公式サイトを開く ↗',
    member: '公式ファンクラブ', shop: '公式グッズショップ',
    note: '非公式ファンプロジェクトです。会員ログインと購入は公式サイトで行います。',
    error: 'リンクを開けませんでした。もう一度お試しください。',
  },
};

export default function ExploreScreen() {
  const webLayout = useWebLayout();
  const router = useRouter();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const text = language.startsWith('zh') ? translations.zh
    : language.startsWith('ja') ? translations.ja : translations.en;
  const [error, setError] = useState(false);

  const links = [
    { title: 'X (Twitter)', url: 'https://x.com/ado1024imokenp' },
    { title: 'Instagram', url: 'https://www.instagram.com/ado1024sweetpotet/' },
    { title: 'niconico', url: 'https://www.nicovideo.jp/user/39170211/mylist/58569901' },
    { title: text.member, url: 'https://ado-dokidokihimitsukichi-daigakuimo.com/' },
    { title: text.shop, url: 'https://ado-officialshop-friedpotato.com/' },
  ];

  async function openLink(url: string) {
    setError(false);
    try {
      await Linking.openURL(url);
    } catch {
      setError(true);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, webLayout.contentStyle]}>
        <Text style={styles.accent}>ADO FAN HUB</Text>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.muted}>{text.subtitle}</Text>

        <AnimatedPressable accessibilityRole="button"
          onPress={() => router.push('/analytics')} style={styles.card}>
          <View style={styles.cardHeading}><ExploreIcon name="chart" /><Text style={styles.heading}>{text.analytics}</Text></View>
          <Text style={styles.muted}>{text.analyticsNote}</Text>
        </AnimatedPressable>

        <AnimatedPressable accessibilityRole="button"
          onPress={() => router.push('/mv')} style={styles.card}>
          <View style={styles.cardHeading}><ExploreIcon name="music" /><Text style={styles.heading}>{text.mv}</Text></View>
          <Text style={styles.muted}>{text.mvNote}</Text>
        </AnimatedPressable>

        <AnimatedPressable accessibilityRole="button"
          onPress={() => router.push('/following')} style={styles.card}>
          <View style={styles.cardHeading}><ExploreIcon name="heart" /><Text style={styles.heading}>{i18n.t('following')}</Text></View>
        </AnimatedPressable>

        <Text style={styles.heading}>{text.official}</Text>
        {error && (
          <Text accessibilityRole="alert" style={styles.muted}>{text.error}</Text>
        )}
        <View style={styles.links}>
          {links.map((link) => (
            <AnimatedPressable key={link.url} accessibilityRole="link"
              onPress={() => void openLink(link.url)} style={styles.card}>
              <View style={styles.cardHeading}><View style={styles.iconCircle}><ExploreIcon name={link.title === 'X (Twitter)' ? 'x' : link.title === 'Instagram' ? 'instagram' : link.title === 'niconico' ? 'video' : link.title === text.member ? 'member' : 'shop'} /></View><View style={styles.linkDetails}><Text style={styles.heading}>{link.title}</Text><Text style={styles.accent}>{text.external}</Text></View></View>

            </AnimatedPressable>
          ))}
        </View>
        <Text style={styles.muted}>{text.note}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FanColors.background },
  content: {
    width: '100%', maxWidth: 850, alignSelf: 'center',
    padding: 24, paddingTop: Platform.OS === 'web' ? 100 : 24,
    paddingBottom: 110, gap: 18,
  },
  title: { color: FanColors.text, fontSize: 34, fontWeight: '800' },
  heading: { color: FanColors.text, fontSize: 19, fontWeight: '700' },
  accent: { color: FanColors.accent, fontWeight: '600' },
  muted: { color: FanColors.muted, fontSize: 14, lineHeight: 23 },
  card: { padding: 22, borderRadius: 20, backgroundColor: FanColors.surface, gap: 10 },
  links: { gap: 14 },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconCircle: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: FanColors.selected, alignItems: 'center', justifyContent: 'center',
  },
  linkDetails: { flex: 1, minWidth: 0, gap: 8 },
});
