import { fanPageHeader } from '@/constants/fan-page-header';
import { hubCopy } from '@/localization/hub-copy';
import OfficialLinkImage from '@/components/official-link-image';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import ExploreIcon from '@/components/explore-icon';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AnimatedPressable from '@/components/animated-pressable';

const translations = {
  zh: {
    xNote: '\u8ffd\u8e64 Ado \u7684\u5b98\u65b9 X \u5e33\u865f\u8207\u6700\u65b0\u52d5\u614b',
    instagramNote: '\u67e5\u770b Ado \u7684\u5b98\u65b9 Instagram \u8cbc\u6587\u8207\u9650\u6642\u52d5\u614b',
    niconicoNote: '\u89c0\u770b Ado \u5728 niconico \u767c\u5e03\u7684\u5f71\u7247',
    title: '探索', subtitle: '探索 Ado 的音樂、數據與官方資訊。',
    analytics: '數據分析', analyticsNote: '訂閱趨勢、頻道觀看數與 MV 排行榜',
    mv: '所有 MV', mvNote: '原唱與 Cover，搜尋你想聽的歌曲',
    official: '官方入口', external: '開啟連結 ↗',
    member: '官方會員網站', shop: '官方周邊商店',
    tiktokNote: '\u95dc\u6ce8 Ado \u7684 TikTok \u5b98\u65b9\u5e33\u865f',
    spotifyNote: '在 Spotify 收聽 Ado 的音樂',
    appleMusicNote: '在 Apple Music 收聽 Ado 的音樂',
    lineNote: '關注 Ado 的 LINE 官方消息',
    universalNote: 'Ado \u7684\u5531\u7247\u516c\u53f8\u5b98\u65b9\u4ecb\u7d39',
    cloudNineNote: 'Ado \u6240\u5c6c\u7d93\u7d00\u516c\u53f8\u7684\u85dd\u4eba\u4ecb\u7d39',
    discordNote: 'Ado Hangout \u7c89\u7d72\u793e\u7fa4\uff08\u975e\u5b98\u65b9\uff09',
    note: '本 App 為非官方粉絲專案。會員登入與購買由官方網站處理。',
    error: '無法開啟連結，請稍後重試。',
  },
  en: {
    xNote: "Follow Ado's official X account and updates",
    instagramNote: "See Ado's official Instagram posts and stories",
    niconicoNote: "Watch Ado's videos on niconico",
    title: 'Explore', subtitle: 'Explore Ado’s music, statistics and official updates.',
    analytics: 'Analytics', analyticsNote: 'Subscribers, channel views and MV rankings',
    mv: 'All MVs', mvNote: 'Find original songs and covers',
    official: 'Official links', external: 'Open link ↗',
    member: 'Official fan club', shop: 'Official merchandise shop',
    tiktokNote: 'Follow Ado on TikTok',
    spotifyNote: 'Listen to Ado on Spotify',
    appleMusicNote: 'Listen to Ado on Apple Music',
    lineNote: 'Ado updates on LINE',
    universalNote: 'Ado biography at UNIVERSAL MUSIC JAPAN',
    cloudNineNote: 'Ado artist profile at Cloud Nine',
    discordNote: 'Ado Hangout fan community (unofficial)',
    note: 'An unofficial fan project. Membership sign-in and purchases are handled on official websites.',
    error: 'Unable to open the link. Please try again.',
  },
  ja: {
    xNote: 'Ado\u306e\u516c\u5f0f X \u3068\u6700\u65b0\u60c5\u5831',
    instagramNote: 'Ado\u306e\u516c\u5f0f Instagram \u306e\u6295\u7a3f\u3068\u30b9\u30c8\u30fc\u30ea\u30fc',
    niconicoNote: 'niconico \u3067 Ado \u306e\u52d5\u753b\u3092\u8996\u8074',
    title: '探索', subtitle: 'Adoの音楽、データ、公式情報を探す。',
    analytics: 'データ分析', analyticsNote: '登録者数の推移、総再生回数、MVランキング',
    mv: 'すべてのMV', mvNote: 'オリジナル曲とカバーを検索',
    official: '公式リンク', external: 'リンクを開く ↗',
    member: '公式ファンクラブ', shop: '公式グッズショップ',
    tiktokNote: 'TikTok\u3067Ado\u306e\u52d5\u753b\u3092\u898b\u308b',
    spotifyNote: 'SpotifyでAdoの音楽を聴く',
    appleMusicNote: 'Apple MusicでAdoの音楽を聴く',
    lineNote: 'LINEでAdoの最新情報を確認',
    universalNote: 'UNIVERSAL MUSIC JAPAN\u306eAdo\u516c\u5f0f\u7d39\u4ecb',
    cloudNineNote: 'Cloud Nine\u306eAdo\u516c\u5f0f\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb',
    discordNote: 'Ado Hangout\u30d5\u30a1\u30f3\u30b3\u30df\u30e5\u30cb\u30c6\u30a3\uff08\u975e\u516c\u5f0f\uff09',
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
  const [linksWidth, setLinksWidth] = useState(0);
  const columns = Platform.OS === 'web' ? Math.max(1, Math.min(3, Math.floor((linksWidth + 14) / 354))) : 1;
  const linkWidth = columns > 1 ? (linksWidth - 14 * (columns - 1)) / columns : undefined;

  const links = [
    { id: 'x', title: 'X (Twitter)', subtitle: text.xNote, url: 'https://x.com/ado1024imokenp' },
    { id: 'instagram', title: 'Instagram', subtitle: text.instagramNote, url: 'https://www.instagram.com/ado1024sweetpotet/' },
    { id: 'niconico', title: 'niconico', subtitle: text.niconicoNote, url: 'https://www.nicovideo.jp/user/39170211/mylist/58569901' },
    { id: 'tiktok', title: 'TikTok', subtitle: text.tiktokNote, url: 'https://www.tiktok.com/@ado1024osenbei' },
    { id: 'member', title: 'Ado\u306e\u30c9\u30ad\u30c9\u30ad\u79d8\u5bc6\u57fa\u5730', subtitle: text.member, url: 'https://ado-dokidokihimitsukichi-daigakuimo.com/' },
    { id: 'shop', title: 'Ado Official Shop', subtitle: text.shop, url: 'https://ado-officialshop-friedpotato.com/' },
    { id: 'universal', title: 'UNIVERSAL MUSIC JAPAN', subtitle: text.universalNote, url: 'https://www.universal-music.co.jp/ado/biography/' },
    { id: 'cloud9', title: 'Cloud Nine', subtitle: text.cloudNineNote, url: 'https://cloud9pro.co.jp/artist/profile/ado/' },
    { id: 'spotify', title: 'Spotify', subtitle: text.spotifyNote, url: 'https://open.spotify.com/artist/6mEQK9m2krja6X1cfsAjfl' },
    { id: 'apple-music', title: 'Apple Music', subtitle: text.appleMusicNote, url: 'https://music.apple.com/us/artist/ado/1492604670' },
    { id: 'line', title: 'LINE', subtitle: text.lineNote, url: 'https://page.line.me/ado_jagaimo0110' },
    { id: 'discord', title: 'Discord', subtitle: text.discordNote, url: 'https://discord.com/invite/ado1024' },
  ] as const;

  async function openLink(url: string, officialMember = false) {
    setError(false);
    try {
      if (officialMember && Platform.OS !== 'web') {
        await WebBrowser.openBrowserAsync(url, {
          createTask: false,
          showTitle: true,
        });
      } else {
        await Linking.openURL(url);
      }
    } catch {
      setError(true);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView contentContainerStyle={[styles.content, webLayout.contentStyle]}>
        <Text style={[styles.accent, fanPageHeader.eyebrow]}>ADO FAN HUB</Text>
        <Text style={[styles.title, fanPageHeader.title]}>{text.title}</Text>
        <Text style={[styles.muted, fanPageHeader.subtitle]}>{text.subtitle}</Text>
        {Platform.OS === 'web' ? (
          <View style={styles.webFeatures}>
            {Array.from({ length: webLayout.width >= 800 ? 3 : 5 }, (_, row) => (
              <View key={row} style={styles.webFeatureRow}>
                {[
                  { route: '/about', icon: 'member', title: hubCopy(language).about, note: hubCopy(language).aboutNote },
                  { route: '/news', icon: 'video', title: hubCopy(language).news, note: hubCopy(language).newsNote },
                  { route: '/analytics', icon: 'chart', title: text.analytics, note: text.analyticsNote },
                  { route: '/mv', icon: 'music', title: text.mv, note: text.mvNote },
                  { route: '/following', icon: 'heart', title: i18n.t('following'), note: '' },
                ].slice(row * (webLayout.width >= 800 ? 2 : 1), (row + 1) * (webLayout.width >= 800 ? 2 : 1)).map(item => (
                  <View key={item.route} style={styles.webFeatureCell}>
                    <AnimatedPressable accessibilityRole="button"
                      onPress={() => router.push(item.route as '/about' | '/news' | '/analytics' | '/mv' | '/following')}
                      style={[styles.card, styles.webFeatureCard]}>
                      <View style={styles.cardHeading}><ExploreIcon name={item.icon as 'member' | 'video' | 'chart' | 'music' | 'heart'} /><Text style={styles.heading}>{item.title}</Text></View>
                      {item.note !== '' && <Text style={styles.muted}>{item.note}</Text>}
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <>
        <AnimatedPressable accessibilityRole="button" onPress={() => router.push('/about')} style={styles.card}>
          <View style={styles.cardHeading}><ExploreIcon name="member" /><Text style={styles.heading}>{hubCopy(language).about}</Text></View>
          <Text style={styles.muted}>{hubCopy(language).aboutNote}</Text>
        </AnimatedPressable>

        <AnimatedPressable accessibilityRole="button"
          onPress={() => router.push('/news')} style={styles.card}>
          <View style={styles.cardHeading}><ExploreIcon name="video" /><Text style={styles.heading}>{hubCopy(language).news}</Text></View>
          <Text style={styles.muted}>{hubCopy(language).newsNote}</Text>
        </AnimatedPressable>

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
          </>
        )}

        <Text style={styles.heading}>{text.official}</Text>
        {error && (
          <Text accessibilityRole="alert" style={styles.muted}>{text.error}</Text>
        )}
        <View style={[styles.links, Platform.OS === 'web' && styles.webLinks]} onLayout={(event) => setLinksWidth(event.nativeEvent.layout.width)}>
          {links.map((link) => (
            <AnimatedPressable key={link.url} accessibilityRole="link"
              onPress={() => void openLink(link.url, link.id === 'member')} style={[styles.card, Platform.OS === 'web' && styles.linkCard, linkWidth !== undefined && { width: linkWidth }]}>
              <View style={styles.cardHeading}>
                  <OfficialLinkImage source={link.id} />
                  <View style={styles.linkDetails}>
                    <Text style={styles.heading}>{link.title}</Text>
                    {'subtitle' in link && (
                      <Text style={styles.muted}>{link.subtitle}</Text>
                    )}
                    <Text style={styles.accent}>{text.external}</Text>
                  </View>
                </View>

            </AnimatedPressable>
          ))}
        </View>
        <Text style={styles.muted}>{text.note}</Text>
      </RoseScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  webFeatures: { gap: 14 },
  webFeatureRow: { flexDirection: 'row', gap: 14 },
  webFeatureCell: { flex: 1, minWidth: 0 },
  webFeatureCard: { minHeight: 120, justifyContent: 'center' },
  container: { flex: 1, backgroundColor: FanColors.background },
  content: {
    width: '100%', maxWidth: 850, alignSelf: 'center',
    padding: 24, paddingTop: Platform.OS === 'web' ? 100 : 8,
    paddingBottom: 110, gap: 18,
  },
  title: { color: FanColors.text, fontSize: 28, fontWeight: '800' },
  heading: { color: FanColors.text, fontSize: 19, fontWeight: '700' },
  accent: { color: FanColors.accent, fontWeight: '600' },
  muted: { color: FanColors.muted, fontSize: 14, lineHeight: 23 },
  card: { padding: 22, borderRadius: 20, backgroundColor: FanColors.surface, gap: 10 },
  links: { gap: 14 },
  webLinks: { flexDirection: 'row', flexWrap: 'wrap' },
  linkCard: { width: '100%', justifyContent: 'center' },
  cardHeading: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  linkDetails: { flex: 1, minWidth: 0, gap: 8 },
});
