import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';

import { Pressable, View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  const { t } = useTranslation();
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>{t('home')}</TabButton>
          </TabTrigger>
          <TabTrigger name="news" href="/news" asChild>
            <TabButton>{t('news')}</TabButton>
          </TabTrigger>
          <TabTrigger name="following" href="/following" asChild>
            <TabButton>{t('following')}</TabButton>
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
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer}>
        <ThemedText style={styles.brandText}>
          Ado Fan Hub
        </ThemedText>
        {props.children}
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
    backgroundColor: '#191923',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 900,
  },
  brandText: {
    color: '#FFFFFF',
    fontWeight: '800',
    marginRight: 'auto',
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
    backgroundColor: '#302641',
  },
  tabText: {
    color: '#AAA6BC',
    fontSize: 13,
  },
  activeText: {
    color: '#C8B4FF',
    fontWeight: '700',
  },
});

