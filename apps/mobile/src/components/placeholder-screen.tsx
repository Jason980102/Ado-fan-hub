import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

type PlaceholderScreenProps = {
  title: string;
  subtitle: string;
  features: string[];
};

export default function PlaceholderScreen({
  title,
  subtitle,
  features,
}: PlaceholderScreenProps) {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>ADO FAN HUB</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('comingSoon')}</Text>
          <Text style={styles.description}>
            {t('workingOnFeatures')}
          </Text>

          {features.map((feature) => (
            <Text key={feature} style={styles.feature}>
              {'•  '}{feature}
            </Text>
          ))}
        </View>

        <Text style={styles.footer}>
          {t('developmentFooter')}
        </Text>
      </RoseScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FanColors.background,
  },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 115 : 24,
    paddingBottom: 110,
    gap: 16,
  },
  eyebrow: {
    color: FanColors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: FanColors.text,
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: FanColors.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  card: {
    backgroundColor: FanColors.surface,
    borderRadius: 22,
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 115 : 24,
    gap: 14,
    marginTop: 12,
  },
  cardTitle: {
    color: FanColors.accent,
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: FanColors.text,
    fontSize: 14,
  },
  feature: {
    color: FanColors.muted,
    fontSize: 14,
    lineHeight: 23,
  },
  footer: {
    color: FanColors.subtle,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});
