import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import Svg, { Path } from 'react-native-svg';
import { usePathname, useRouter } from 'expo-router';
import '@/localization/analytics-i18n';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';

import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  const { t, i18n } = useTranslation();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild style={{ display: 'none' }}>
        <CustomTabList>
          <TabTrigger name="reports" href="/reports" />
          <TabTrigger name="analytics" href="/analytics" />
          <TabTrigger name="following" href="/following" />
          <TabTrigger name="about" href="/about" />
          <TabTrigger name="news" href="/news" />
          <TabTrigger name="news-article" href="/news-article" />
          <TabTrigger name="wishlist" href="/wishlist" />
          <TabTrigger name="home" href="/" asChild>
            <TabButton>{t('home')}</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>{i18n.language.startsWith('zh') ? '探索' : i18n.language.startsWith('ja') ? '探索' : 'Explore'}</TabButton>
          </TabTrigger>
          <TabTrigger name="shop" href="/shop" asChild>
            <TabButton>{i18n.language.startsWith('zh') ? '周邊' : i18n.language.startsWith('ja') ? 'グッズ' : 'Shop'}</TabButton>
          </TabTrigger>
          <TabTrigger name="mv" href="/mv" asChild>
            <TabButton>MV</TabButton>
          </TabTrigger>

          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton>{t('settings')}</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  ...props
}: TabTriggerSlotProps) {
  return (
    <Pressable {...props} style={({ pressed }) => [
      pressed && styles.pressed,
    ]}>
      <ThemedView
        style={[
          styles.tabButtonView,
          isFocused && styles.activeTab,
        ]}>
        <ThemedText style={[
          styles.tabText,
          isFocused && styles.activeText,
        ]}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const webLayout = useWebLayout();
  const router = useRouter();
  const pathname = usePathname();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const backLabel = language.startsWith('zh') ? '返回'
    : language.startsWith('ja') ? '戻る' : 'Back';

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        {pathname !== '/' && (
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel}
            onPress={goBack}
            style={({ pressed }) => ({
              minWidth: 44, minHeight: 44,
              alignItems: 'center', justifyContent: 'center',
              borderRadius: 12, backgroundColor: FanColors.surfaceAlt,
              opacity: pressed ? 0.6 : 1,
            })}>
            <Svg width={24} height={24} viewBox="0 0 24 24"
              aria-hidden={true} style={{ display: 'flex' }}>
              <Path d="M14 6 8 12l6 6" fill="none"
                stroke={FanColors.accent} strokeWidth={2.4}
                strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        )}
        {webLayout.width >= 700 && (
          <ThemedText style={styles.brandText}>Ado Fan Hub</ThemedText>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flex: 1, minWidth: 0 }}
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: webLayout.width >= 700 ? 'flex-end' : 'flex-start',
            alignItems: 'center',
            gap: 8,
          }}>
          {props.children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    top: 0,
    width: '100%',
    padding: 12,
    alignItems: 'center',
  },
  innerContainer: {
    backgroundColor: FanColors.surface,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 1280,
  },
  brandText: {
    color: FanColors.text,
    fontWeight: '800',
    marginRight: 16,
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  activeTab: {
    backgroundColor: FanColors.selected,
  },
  tabText: {
    color: FanColors.muted,
    fontSize: 13,
  },
  activeText: {
    color: FanColors.accent,
    fontWeight: '700',
  },
});
