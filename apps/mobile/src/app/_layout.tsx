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
        <ActivityIndicator color="#B59AFF" />
      </View>
    );
  }

  if ((__DEV__ && SHOW_ONBOARDING_PREVIEW) || !preferences.onboardingCompleted) {
    return <OnboardingScreen />;
  }

  return <AppTabs />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <PreferencesProvider>
      <ThemeProvider
        value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <AnimatedSplashOverlay />
        <AppContent />
      </ThemeProvider>
    </PreferencesProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0B0B12',
    justifyContent: 'center',
    alignItems: 'center',
  },
});



