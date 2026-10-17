import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Linking, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import '@/localization/analytics-i18n';
import MvCatalog from '@/components/mv-catalog';
import { getAnalytics, type AnalyticsResponse } from '@/services/analytics-api';

export default function MvScreen() {
  const { t, i18n } = useTranslation('analytics');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 45000);
    setBusy(true);
    setError(false);

    void getAnalytics(controller.signal)
      .then((result) => {
        if (active && !controller.signal.aborted) setData(result);
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
  }, [version]);

  function refresh() {
    if (!busy) setVersion((current) => current + 1);
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl refreshing={busy && data !== null}
            onRefresh={refresh} tintColor="#B59AFF" colors={['#B59AFF']} />
        }>
        <Text style={styles.accent}>ADO FAN HUB</Text>
        <Text style={styles.title}>MV</Text>
        {Platform.OS === 'web' && (
<Pressable accessibilityRole="button" disabled={busy}
          onPress={refresh} style={styles.button}>
          <Text style={styles.accent}>{busy ? t('loading') : t('refresh')}</Text>
        </Pressable>
)}
        {busy && !data && <ActivityIndicator color="#B59AFF" size="large" />}
        {error && <Text accessibilityRole="alert" style={styles.muted}>{t('error')}</Text>}
        {linkError && <Text accessibilityRole="alert" style={styles.muted}>{t('linkError')}</Text>}
        {data && (
          <>
            <MvCatalog videos={data.videos} formatNumber={number}
              onSelect={(id) => void openVideo(id)} />
            {data.unavailable_video_ids.length > 0 && (
              <Text style={styles.muted}>{t('missing')}</Text>
            )}
            <Text style={styles.muted}>{t('note')}</Text>
            <Text style={styles.muted}>{t('source')}: {data.source}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0B12' },
  content: {
    width: '100%', maxWidth: 850, alignSelf: 'center',
    padding: 24, paddingTop: Platform.OS === 'web' ? 100 : 24,
    paddingBottom: 110, gap: 16,
  },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  accent: { color: '#C8B4FF', fontWeight: '600' },
  muted: { color: '#AAA6BC', fontSize: 14, lineHeight: 22 },
  button: {
    alignSelf: 'flex-end', padding: 12,
    borderRadius: 12, backgroundColor: '#292439',
  },
});
