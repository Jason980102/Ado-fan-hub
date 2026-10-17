import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { usePreferences } from '@/contexts/preferences-context';
import { getNews, type NewsItem } from '@/services/news-api';

const CATEGORY_KEYS = {
  official: 'newsCategoryOfficial',
  concert: 'newsCategoryConcert',
  media: 'newsCategoryMedia',
  merch: 'newsCategoryMerch',
} as const;

export default function NewsScreen() {
  const { t, i18n } = useTranslation();
  const { preferences } = usePreferences();

  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const loadNews = useCallback(
    async (isRefresh = false, signal?: AbortSignal) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(false);

      try {
        const result = await getNews(10, signal);

        if (!signal?.aborted) {
          setItems(result.items);
        }
      } catch (err) {
        if (!signal?.aborted) {
          console.error('Unable to fetch news:', err);
          setError(true);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadNews(false, controller.signal);

    return () => controller.abort();
  }, [loadNews]);

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    try {
      return new Intl.DateTimeFormat(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: preferences.timeZone,
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
  }

  async function openOfficialLink(url: string) {
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.error('Unable to open official link:', err);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadNews(true)}
            tintColor="#B59AFF"
            colors={['#B59AFF']}
          />
        }
      >
        <Text style={styles.eyebrow}>ADO FAN HUB</Text>
        <Text style={styles.title}>{t('newsTitle')}</Text>
        <Text style={styles.subtitle}>{t('newsSubtitle')}</Text>

        <Pressable
          style={styles.refreshButton}
          onPress={() => void loadNews(true)}
          disabled={loading || refreshing}
        >
          <Text style={styles.refreshText}>
            {refreshing ? t('newsLoading') : t('newsRefresh')}
          </Text>
        </Pressable>

        {loading && (
          <View style={styles.status}>
            <ActivityIndicator color="#B59AFF" size="large" />
            <Text style={styles.muted}>{t('newsLoading')}</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.status}>
            <Text style={styles.muted}>{t('newsError')}</Text>
            <Pressable onPress={() => void loadNews()}>
              <Text style={styles.action}>{t('newsRetry')}</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && items.length === 0 && (
          <View style={styles.status}>
            <Text style={styles.muted}>{t('newsEmpty')}</Text>
          </View>
        )}

        {!loading && !error && items.map((item) => (
          <Pressable
            key={item.id}
            style={styles.card}
            onPress={() => void openOfficialLink(item.source_url)}
          >
            <View style={styles.meta}>
              <Text style={styles.category}>
                {t(CATEGORY_KEYS[item.category])}
              </Text>
              <Text style={styles.date}>
                {formatDate(item.published_at)}
              </Text>
            </View>

            <View style={styles.newsBody}>
              <View style={styles.newsText}>
                <Text style={styles.newsTitle}>{item.title}</Text>
                <Text style={styles.source}>
                  {t('newsSource')}: {item.source_name}
                </Text>
              </View>

              {item.image_url ? (
                failedImages.includes(item.id) ? (
                  <View style={[styles.thumbnail, Platform.OS === 'web' ? styles.thumbnailWeb : styles.thumbnailMobile, styles.imageFallback,]}>
                    <Text style={styles.imageFallbackText}>♪</Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.image_url }}
                    style={[
                      styles.thumbnail,
                      Platform.OS === 'web'
                        ? styles.thumbnailWeb
                        : styles.thumbnailMobile,
                    ]}
                    resizeMode="cover"
                    onError={() => {
                      setFailedImages((current) =>
                        current.includes(item.id)
                          ? current
                          : [...current, item.id]
                      );
                    }}
                  />
                )
              ) : null}
            </View>

            <Text style={styles.action}>
              {t('newsOpenOfficial')} ↗
            </Text>
          </Pressable>
        ))}

        <Text style={styles.footer}>{t('homeFooter')}</Text>
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
    paddingTop: Platform.OS === 'web' ? 100 : 24,
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
  refreshButton: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#292439',
  },
  refreshText: {
    color: '#C8B4FF',
    fontSize: 13,
    fontWeight: '600',
  },
  status: {
    backgroundColor: '#191923',
    padding: 32,
    borderRadius: 22,
    alignItems: 'center',
    gap: 18,
  },
  muted: {
    color: '#AAA6BC',
    textAlign: 'center',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#191923',
    borderRadius: 20,
    padding: 22,
    gap: 14,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  category: {
    color: '#B59AFF',
    fontSize: 12,
    fontWeight: '700',
  },
  date: {
    color: '#9993A8',
    fontSize: 12,
  },
  newsBody: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  newsText: {
    flex: 1,
    gap: 14,
    minWidth: 0,
  },
  newsTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 27,
  },
  source: {
    color: '#AAA6BC',
    fontSize: 12,
  },
  thumbnail: {
    borderRadius: 12,
    backgroundColor: '#292439',
  },
  thumbnailWeb: {
    width: 110,
    height: 110,
  },
  thumbnailMobile: {
    width: 88,
    height: 88,
  },
  imageFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFallbackText: {
    color: '#B59AFF',
    fontSize: 32,
    fontWeight: '700',
  },
  action: {
    color: '#B59AFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    color: '#777386',
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});