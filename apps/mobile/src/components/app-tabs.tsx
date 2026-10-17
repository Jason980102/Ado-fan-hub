import Svg, { Path } from 'react-native-svg';
import { FanColors } from '@/constants/fan-theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import '@/localization/analytics-i18n';
import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function AppTabs() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = i18n.resolvedLanguage || i18n.language;
  const backLabel = language.startsWith('zh') ? '返回'
    : language.startsWith('ja') ? '戻る' : 'Back';
  const exploreLabel = language.startsWith('zh') ? '探索'
    : language.startsWith('ja') ? '探索' : 'Explore';

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  const pages = [
    { name: 'index', title: t('home'), icon: '⌂' },
    { name: 'news', title: t('news'), icon: '▤' },
    { name: 'explore', title: exploreLabel, icon: '◈' },
    { name: 'mv', title: 'MV', icon: '♫' },
    { name: 'settings', title: t('settings'), icon: '⚙' },
  ];

  return (
    <Tabs backBehavior="history" screenOptions={{
      headerShown: true,
      headerStyle: { height: insets.top + 44 },
      header: () => (
        <View style={{
          paddingTop: insets.top,
          backgroundColor: FanColors.background,
        }}>
          <View style={{
            height: 44, justifyContent: 'center', paddingHorizontal: 12,
          }}>
            <Pressable accessibilityRole="button"
              accessibilityLabel={backLabel}
              onPress={goBack}
              style={({ pressed }) => ({
                width: 44, height: 44,
                alignItems: 'center', justifyContent: 'center',
                opacity: pressed ? 0.5 : 1,
              })}>
              <Svg width={24} height={24} viewBox="0 0 24 24">
                <Path d="M14 6 8 12l6 6" fill="none"
                  stroke={FanColors.accent} strokeWidth={2.4}
                  strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>
        </View>
      ),
      tabBarActiveTintColor: FanColors.accent,
      tabBarInactiveTintColor: FanColors.muted,
      tabBarStyle: {
        backgroundColor: FanColors.background,
        borderTopColor: FanColors.surfaceAlt,
      },
      tabBarLabelStyle: { fontSize: 10 },
      tabBarHideOnKeyboard: true,
    }}>
      {pages.map((page) => (
        <Tabs.Screen key={page.name} name={page.name} options={{
          title: page.title,
          headerShown: page.name !== 'index',
          tabBarIcon: ({ color }) => (
            <Text style={{
              color,
              fontSize: page.name === 'news' || page.name === 'mv' ? 19 : 22,
              lineHeight: 24,
              textAlign: 'center',
              includeFontPadding: false,
            }}>{page.icon}</Text>
          ),
        }} />
      ))}
      <Tabs.Screen name="analytics" options={{ href: null, title: t('analytics:title') }} />
      <Tabs.Screen name="following" options={{ href: null, title: t('following') }} />
    </Tabs>
  );
}
