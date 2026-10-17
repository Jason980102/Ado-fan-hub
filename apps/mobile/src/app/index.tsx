import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const COLORS = {
  background: FanColors.background,
  surface: FanColors.surface,
  surfaceAlt: FanColors.surfaceAlt,
  accent: FanColors.accent,
  white: FanColors.text,
  muted: FanColors.muted,
};


export default function HomeScreen() {
  const webLayout = useWebLayout();
  const { t, i18n } = useTranslation();

  const sections = [
    { icon: '📰', title: t('homeNewsTitle'), description: t('homeNewsDescription') },
    { icon: '🎤', title: t('homeConcertsTitle'), description: t('homeConcertsDescription') },
    { icon: '🛍️', title: t('homeMerchTitle'), description: t('homeMerchDescription') },
    { icon: '💜', title: t('homeCommunityTitle'), description: t('homeCommunityDescription') },
  ];
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <RoseScrollView
          contentContainerStyle={[styles.content, webLayout.contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 12 }}>
            <Text style={styles.eyebrow}>{t('homeEyebrow')}</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 16,
            }}>
              <Text style={[styles.title, {
                flex: 1, minWidth: 0, marginTop: 0,
              }]}>Ado Fan Hub</Text>
              <View style={{
                width: webLayout.wide ? 100 : 80,
                height: webLayout.wide ? 100 : 80,
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Image
                  source={require('../../assets/images/blue-rose-icon.png')}
                  resizeMode="contain"
                  style={{
                    width: webLayout.wide ? 92 : 74,
                    height: webLayout.wide ? 92 : 74,
                  }}
                  accessibilityLabel={
                    i18n.language.startsWith('zh') ? '原創藍玫瑰'
                      : i18n.language.startsWith('ja') ? '青いバラの作品'
                      : 'Original blue rose artwork'
                  }
                />
              </View>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>{t('homeWelcome')}</Text>
            <Text style={styles.heroTitle}>{t('homeHeroTitle')}</Text>
            <Text style={styles.heroDescription}>
              {t('homeHeroDescription')}
            </Text>
          </View>

          <Text style={styles.sectionHeading}>{t('homeExplore')}</Text>

          <View style={styles.grid}>
            {sections.map((item) => (
              <View key={item.title} style={styles.card}>
                <Text style={styles.cardIcon}>{item.icon}</Text>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardDescription}>
                  {item.description}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>🚧 {t('homeDevelopmentTitle')}</Text>
            <Text style={styles.noticeText}>
              {t('homeDevelopmentText')}
            </Text>
          </View>

          <Text style={styles.footer}>
            {t('homeFooter')}
          </Text>
        </RoseScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 100 : 24,
    paddingBottom: 110,
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: COLORS.white,
    fontSize: 30,
    fontWeight: '800',
    marginTop: 6,
  },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.surfaceAlt,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    color: COLORS.accent,
    fontSize: 26,
  },
  hero: {
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 24,
    padding: 25,
    gap: 12,
    minHeight: 190,
    justifyContent: 'center',
  },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: 32 },
  heroCopy: { flex: 1, width: '100%', minWidth: 0, gap: 12 },
  roseArt: {
    width: '100%', maxWidth: 300, height: 190,
    alignSelf: 'center', borderRadius: 18,
  },
  roseArtWide: { width: 280, height: 210 },
  heroLabel: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 34,
  },
  heroDescription: {
    color: FanColors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  sectionHeading: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: '800',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: {
    width: '48%',
    minHeight: 155,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 17,
    gap: 10,
  },
  cardIcon: {
    fontSize: 27,
  },
  cardTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  cardDescription: {
    color: COLORS.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  notice: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: FanColors.border,
  },
  noticeTitle: {
    color: COLORS.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  noticeText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 21,
  },
  footer: {
    color: FanColors.subtle,
    fontSize: 11,
    textAlign: 'center',
  },
});
