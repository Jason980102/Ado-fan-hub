import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const COLORS = {
  background: '#0B0B12',
  surface: '#191923',
  surfaceAlt: '#242033',
  accent: '#B59AFF',
  white: '#FFFFFF',
  muted: '#A9A6B6',
};

const sections = [
  {
    icon: '📰',
    title: 'Latest News',
    description: 'Official announcements and updates',
  },
  {
    icon: '🎤',
    title: 'Concerts',
    description: 'Upcoming events and reminders',
  },
  {
    icon: '🛍️',
    title: 'Merchandise',
    description: 'New releases and restock tracking',
  },
  {
    icon: '💜',
    title: 'Fan Community',
    description: 'Connect with Ado fans worldwide',
  },
];

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>YOUR ADO COMPANION</Text>
              <Text style={styles.title}>Ado Fan Hub</Text>
            </View>

            <View style={styles.headerIcon}>
              <Text style={styles.headerIconText}>♪</Text>
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.heroLabel}>WELCOME</Text>
            <Text style={styles.heroTitle}>
              Stay connected with Ado.
            </Text>
            <Text style={styles.heroDescription}>
              Your favorite updates, concerts, and merchandise —
              all in one place.
            </Text>
          </View>

          <Text style={styles.sectionHeading}>Explore</Text>

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
            <Text style={styles.noticeTitle}>🚧 Under Development</Text>
            <Text style={styles.noticeText}>
              Ado Fan Hub is an independent fan-made project.
              Live news, notifications, and tracking features
              are coming in future updates.
            </Text>
          </View>

          <Text style={styles.footer}>
            Unofficial fan project · Not affiliated with Ado
          </Text>
        </ScrollView>
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
    color: '#CCC5DB',
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
    borderColor: '#302A42',
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
    color: '#777386',
    fontSize: 11,
    textAlign: 'center',
  },
});
