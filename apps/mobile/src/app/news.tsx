import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { usePreferences } from '@/contexts/preferences-context';
import { useNewsFeed } from '@/hooks/use-news-feed';

const CATEGORY_KEYS = {
  official: 'newsCategoryOfficial',
  concert: 'newsCategoryConcert',
  media: 'newsCategoryMedia',
  merch: 'newsCategoryMerch',
} as const;

export default function NewsScreen() {
  const webLayout = useWebLayout();
  const { t, i18n } = useTranslation();
  const { preferences } = usePreferences();

  const {
    items, loading, refreshing, loadingMore, error, moreError, hasMore,
    failedImages, setFailedImages, loadNews, loadMore,
  } = useNewsFeed();
  const language = i18n.resolvedLanguage || i18n.language;
  const feedLabels = language.startsWith('zh') ? {
    more: '載入較舊消息', loading: '正在載入較舊消息…',
    error: '較舊消息載入失敗，點此重試', end: '已顯示目前來源提供的所有消息。',
  } : language.startsWith('ja') ? {
    more: '過去のお知らせを読み込む', loading: '読み込み中…',
    error: '取得できませんでした。再試行', end: '取得可能なお知らせをすべて表示しました。',
  } : {
    more: 'Load older news', loading: 'Loading older news…',
    error: 'Unable to load older news. Retry', end: 'All currently available news has been shown.',
  };

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
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView
        contentContainerStyle={[styles.content, webLayout.contentStyle]}
        scrollEventThrottle={150}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
          if (contentOffset.y > 0 &&
              contentOffset.y + layoutMeasurement.height >= contentSize.height - 240) {
            void loadMore();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadNews(true)}
            tintColor={FanColors.accent}
            colors={[FanColors.accent]}
          />
        }
      >
        <Text style={styles.eyebrow}>ADO FAN HUB</Text>
        <Text style={styles.title}>{t('newsTitle')}</Text>
        <Text style={styles.subtitle}>{t('newsSubtitle')}</Text>

        {Platform.OS === 'web' && (
<Pressable
          style={styles.refreshButton}
          onPress={() => void loadNews(true)}
          disabled={loading || refreshing}
        >
          <Text style={styles.refreshText}>
            {refreshing ? t('newsLoading') : t('newsRefresh')}
          </Text>
        </Pressable>
        )}

        {loading && (
          <View style={styles.status}>
            <ActivityIndicator color={FanColors.accent} size="large" />
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

        {items.map((item) => (
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

        {items.length > 0 && !loading && (
          <View style={styles.status}>
            {loadingMore ? (
              <>
                <ActivityIndicator color={FanColors.accent} />
                <Text style={styles.muted}>{feedLabels.loading}</Text>
              </>
            ) : moreError ? (
              <Pressable accessibilityRole="button" onPress={() => void loadMore(true)}>
                <Text style={styles.action}>{feedLabels.error}</Text>
              </Pressable>
            ) : hasMore ? (
              <Pressable accessibilityRole="button" disabled={refreshing}
                onPress={() => void loadMore()}>
                <Text style={styles.action}>{feedLabels.more}</Text>
              </Pressable>
            ) : !error && (
              <Text style={styles.muted}>{feedLabels.end}</Text>
            )}
          </View>
        )}
        <Text style={styles.footer}>{t('homeFooter')}</Text>
      </RoseScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FanColors.background,
  },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 100 : 12,
    paddingBottom: 110,
    gap: 16,
  },
  eyebrow: {
    color: FanColors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: FanColors.text,
    fontSize: 34,
    lineHeight: 46,
    fontWeight: '800',
  },
  subtitle: {
    color: FanColors.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  refreshButton: {
    alignSelf: 'flex-end',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: FanColors.surfaceAlt,
  },
  refreshText: {
    color: FanColors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  status: {
    backgroundColor: FanColors.surface,
    padding: 32,
    borderRadius: 22,
    alignItems: 'center',
    gap: 18,
  },
  muted: {
    color: FanColors.muted,
    textAlign: 'center',
    fontSize: 14,
  },
  card: {
    backgroundColor: FanColors.surface,
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
    color: FanColors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  date: {
    color: FanColors.subtle,
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
    color: FanColors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 27,
  },
  source: {
    color: FanColors.muted,
    fontSize: 12,
  },
  thumbnail: {
    borderRadius: 12,
    backgroundColor: FanColors.surfaceAlt,
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
    color: FanColors.accent,
    fontSize: 32,
    fontWeight: '700',
  },
  action: {
    color: FanColors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    color: FanColors.subtle,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 20,
  },
});
