import { usePageData } from '@/hooks/use-page-data';
import { useRoseMotion } from '@/contexts/rose-motion-context';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Linking, Platform, Pressable,
  RefreshControl, StyleSheet, Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import '@/localization/analytics-i18n';
import MvCatalog from '@/components/mv-catalog';
import { getMvCatalog, type MvCatalogResponse } from '@/services/mv-api';
import { mvCopy } from '@/localization/mv-copy';

export default function MvScreen() {
  const { restartGrowth } = useRoseMotion();
  const webLayout = useWebLayout();
  const { t, i18n } = useTranslation('analytics');
  const copy = mvCopy(i18n.resolvedLanguage || i18n.language);
  const [data, setData] = useState<MvCatalogResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [version, setVersion] = useState(0);

  usePageData(useCallback(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 45000);
    if (version >= 0) void getMvCatalog(controller.signal)
      .then((result) => {
        if (active && !controller.signal.aborted) { setData(result); setError(false); }
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (active) setBusy(false);
      });

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [version]));

  function refresh() {
    if (busy) return;
    restartGrowth('refresh');
    setBusy(true);
    setError(false);
    setVersion((current) => current + 1);
  }

  function number(value: number | null) {
    return value === null ? t('unknown')
      : new Intl.NumberFormat(i18n.language).format(value);
  }

  async function openVideo(id: string) {
    setLinkError(false);
    try {
      await Linking.openURL(`https://www.youtube.com/watch?v=${id}`);
    } catch {
      setLinkError(true);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView
        showMobileRoseFrame={false}
        contentContainerStyle={[styles.content, webLayout.contentStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={busy && data !== null}
            onRefresh={refresh} tintColor={FanColors.accent} colors={[FanColors.accent]} />
        }>
        <Text style={styles.accent}>ADO FAN HUB</Text>
        <Text style={styles.title}>MV</Text>
        {Platform.OS === 'web' && (
          <Pressable accessibilityRole="button" disabled={busy}
            onPress={refresh} style={styles.button}>
            <Text style={styles.accent}>{busy ? copy.loading : t('refresh')}</Text>
          </Pressable>
        )}
        {busy && !data && <ActivityIndicator color={FanColors.accent} size="large" />}
        {error && <>
          <Text accessibilityRole="alert" style={styles.muted}>{copy.error}</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={refresh} style={styles.button}>
            <Text style={styles.accent}>{copy.retry}</Text>
          </Pressable>
        </>}
        {linkError && <Text accessibilityRole="alert" style={styles.muted}>{t('linkError')}</Text>}
        {data && (
          <>
            {data.partial && <Text accessibilityRole="alert" style={styles.muted}>{copy.partial}</Text>}
            <MvCatalog videos={data.videos} formatNumber={number}
              onSelect={(id) => void openVideo(id)} />
            {data.unavailable_video_ids.length > 0 && (
              <Text style={styles.muted}>{copy.missing}</Text>
            )}
            <Text style={styles.muted}>{t('note')}</Text>
            <Text style={styles.muted}>{t('source')}: {data.source}</Text>
          </>
        )}
      </RoseScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: FanColors.background },
  content: {
    width: '100%', maxWidth: Platform.OS === 'web' ? 1280 : 850, alignSelf: 'center',
    padding: 24, paddingTop: Platform.OS === 'web' ? 100 : 24,
    paddingBottom: 110, gap: 16,
  },
  title: { color: FanColors.text, fontSize: 34, fontWeight: '800' },
  accent: { color: FanColors.accent, fontWeight: '600' },
  muted: { color: FanColors.muted, fontSize: 14, lineHeight: 22 },
  button: {
    alignSelf: 'flex-end', padding: 12,
    borderRadius: 12, backgroundColor: FanColors.surfaceAlt,
  },
});
