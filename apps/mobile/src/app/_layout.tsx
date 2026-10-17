import { RoseMotionProvider } from '@/contexts/rose-motion-context';
import RoseBackground from '@/components/rose-background';
import { FanColors } from '@/constants/fan-theme';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import OnboardingScreen from '@/components/onboarding-screen';
import {
  PreferencesProvider,
  usePreferences,
} from '@/contexts/preferences-context';

SplashScreen.preventAutoHideAsync();

const SHOW_ONBOARDING_PREVIEW = false;

function AppContent() {
  const { preferences, loading } = usePreferences();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FanColors.accent} />
      </View>
    );
  }

  if ((__DEV__ && SHOW_ONBOARDING_PREVIEW) || !preferences.onboardingCompleted) {
    return <OnboardingScreen />;
  }

  return (
    <RoseMotionProvider>
      <View style={{ flex: 1, backgroundColor: FanColors.background }}>
        <AppTabs />
        <RoseBackground />
      </View>
    </RoseMotionProvider>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <PreferencesProvider>
      <ThemeProvider
        value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <AnimatedSplashOverlay />
        <View style={{ flex: 1, backgroundColor: FanColors.background }}>
          <AppContent />
        </View>
      </ThemeProvider>
    </PreferencesProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: FanColors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
