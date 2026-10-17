import '@/localization/analytics-i18n';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function AppTabs() {
  const { t } = useTranslation();

  const pages = [
    { name: 'index', title: t('home'), icon: '⌂' },
    { name: 'news', title: t('news'), icon: '▤' },
    { name: 'analytics', title: t('analytics:tab'), icon: '▥' },
    { name: 'mv', title: 'MV', icon: '♫' },
    { name: 'following', title: t('following'), icon: '♥' },
    { name: 'settings', title: t('settings'), icon: '⚙' },
  ];

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#C8B4FF',
      tabBarInactiveTintColor: '#AAA6BC',
      tabBarStyle: {
        backgroundColor: '#111119',
        borderTopColor: '#292439',
      },
      tabBarLabelStyle: { fontSize: 10 },
      tabBarHideOnKeyboard: true,
    }}>
      {pages.map((page) => (
        <Tabs.Screen key={page.name} name={page.name} options={{
          title: page.title,
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 23 }}>{page.icon}</Text>
          ),
        }} />
      ))}
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}
