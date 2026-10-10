import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0B12',
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
    color: '#B59AFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: '#AAA6BC',
    fontSize: 15,
    lineHeight: 24,
  },
  card: {
    backgroundColor: '#191923',
    borderRadius: 22,
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 115 : 24,
    gap: 14,
    marginTop: 12,
  },
  cardTitle: {
    color: '#B59AFF',
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  feature: {
    color: '#C8C4D6',
    fontSize: 14,
    lineHeight: 23,
  },
  footer: {
    color: '#777386',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});


