import HorizontalFilterRow from '@/components/horizontal-filter-row';
import { fanPageHeader } from '@/constants/fan-page-header';
import RoseScrollView from '@/components/rose-scroll-view';
import { FanColors } from '@/constants/fan-theme';
import { useWebLayout } from '@/hooks/use-web-layout';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import type { NewsSource } from '@/services/news-api';

import { usePreferences } from '@/contexts/preferences-context';
import { useNewsFeed } from '@/hooks/use-news-feed';

const CATEGORY_KEYS = {
  official: 'newsCategoryOfficial',
  concert: 'newsCategoryConcert',
  media: 'newsCategoryMedia',
  merch: 'newsCategoryMerch',
} as const;


const PLATFORM_FILTERS: { key: NewsSource; zh: string; en: string; ja: string }[] = [
  { key: 'all', zh: '\u5168\u90e8', en: 'All', ja: '\u3059\u3079\u3066' },
  { key: 'x', zh: 'X', en: 'X', ja: 'X' },
  { key: 'instagram', zh: 'Instagram', en: 'Instagram', ja: 'Instagram' },
  { key: 'fanclub', zh: '\u79d8\u5bc6\u57fa\u5730\u516c\u544a', en: 'Fan Club News', ja: '\u79d8\u5bc6\u57fa\u5730\u304a\u77e5\u3089\u305b' },
  { key: 'youtube', zh: 'YouTube', en: 'YouTube', ja: 'YouTube' },
  { key: 'universal', zh: '\u74b0\u7403\u97f3\u6a02', en: 'UNIVERSAL MUSIC JAPAN', ja: '\u30e6\u30cb\u30d0\u30fc\u30b5\u30eb \u30df\u30e5\u30fc\u30b8\u30c3\u30af \u30b8\u30e3\u30d1\u30f3' },
];

const X_FILTERS: { key: NewsSource; zh: string; en: string; ja: string }[] = [
  { key: 'x', zh: '\u5168\u90e8 X', en: 'All X', ja: 'X \u3059\u3079\u3066' },
  { key: 'x_staff', zh: 'Ado Staff', en: 'Ado Staff', ja: 'Ado Staff' },
  { key: 'x_ado', zh: 'Ado \u672c\u4eba', en: 'Ado', ja: 'Ado' },
  { key: 'x_fanclub', zh: '\u79d8\u5bc6\u57fa\u5730', en: 'Fan Club', ja: '\u79d8\u5bc6\u57fa\u5730' },
];

function getPlatformLabel(sourceName: string) {
  if (sourceName.startsWith('X - ')) return 'X';
  if (sourceName.startsWith('Instagram')) return 'Instagram';
  if (sourceName === 'Ado Fan Club News') return 'Fan Club News';
  if (sourceName === 'Ado Fan Club Shop') return 'Fan Club Shop';
  if (sourceName === 'Ado Official Shop') return 'Merch Shop';
  if (sourceName.startsWith('YouTube')) return 'YouTube';
  if (sourceName === 'UNIVERSAL MUSIC JAPAN') return 'UNIVERSAL MUSIC JAPAN';
  return sourceName;
}

export default function NewsScreen() {
  const webLayout = useWebLayout();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { preferences } = usePreferences();
  const [platform, setPlatform] = useState<NewsSource>('all');
  const [xFilter, setXFilter] = useState<NewsSource>('x');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);
  const activeSource = platform === 'x' ? xFilter : platform;
  const languageCode = i18n.resolvedLanguage || i18n.language;
  const lang = languageCode.startsWith('zh') ? 'zh'
    : languageCode.startsWith('ja') ? 'ja' : 'en';

  const {
    items, loading, refreshing, loadingMore, error, moreError, hasMore,
    failedImages, setFailedImages, loadNews, loadMore,
  } = useNewsFeed(activeSource, debouncedSearch);
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

  const searchLabels = lang === 'zh' ? {
    placeholder: '\u641c\u5c0b\u65b0\u805e\u6a19\u984c',
    clear: '\u6e05\u9664',
    empty: '\u627e\u4e0d\u5230\u7b26\u5408\u7684\u65b0\u805e\u6a19\u984c',
  } : lang === 'ja' ? {
    placeholder: '\u30cb\u30e5\u30fc\u30b9\u306e\u30bf\u30a4\u30c8\u30eb\u3092\u691c\u7d22',
    clear: '\u30af\u30ea\u30a2',
    empty: '\u8a72\u5f53\u3059\u308b\u30cb\u30e5\u30fc\u30b9\u304c\u3042\u308a\u307e\u305b\u3093',
  } : {
    placeholder: 'Search news titles',
    clear: 'Clear',
    empty: 'No matching news titles found',
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

  function openNewsArticle(item: (typeof items)[number]) {
    router.push({
      pathname: '/news-article',
      params: {
        title: item.title,
        published_at: item.published_at,
        source_name: item.source_name,
        source_url: item.source_url,
        summary: item.summary,
        image_url: item.image_url ?? '',
      },
    });
  }
  return (
    <SafeAreaView style={styles.container} edges={Platform.OS === 'web' ? ['top'] : ['left', 'right']}>
      <RoseScrollView
        staticRoseFrame
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
        <Text style={[styles.eyebrow, fanPageHeader.eyebrow]}>ADO FAN HUB</Text>
        <Text style={[styles.title, fanPageHeader.title]}>{t('newsTitle')}</Text>
        <Text style={[styles.subtitle, fanPageHeader.subtitle]}>{t('newsSubtitle')}</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder={searchLabels.placeholder}
            placeholderTextColor={FanColors.muted}
            accessibilityLabel={searchLabels.placeholder}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            maxLength={100}
          />
          {searchText.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={searchLabels.clear}
              onPress={() => {
                setSearchText('');
                setDebouncedSearch('');
              }}
              style={styles.searchClear}
            >
              <Text style={styles.searchClearText}>{searchLabels.clear}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.filters}>
          <HorizontalFilterRow contentContainerStyle={styles.filterRow}>
            {PLATFORM_FILTERS.map((filter) => (
              <Pressable
                key={filter.key}
                accessibilityRole="button"
                accessibilityState={{ selected: platform === filter.key }}
                onPress={() => setPlatform(filter.key)}
                style={[
                  styles.filterChip,
                  platform === filter.key && styles.filterChipActive,
                ]}
              >
                <Text style={[
                  styles.filterText,
                  platform === filter.key && styles.filterTextActive,
                ]}>{filter[lang]}</Text>
              </Pressable>
            ))}
          </HorizontalFilterRow>
          {platform === 'x' && (
            <HorizontalFilterRow contentContainerStyle={styles.filterRow}>
              {X_FILTERS.map((filter) => (
                <Pressable
                  key={filter.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: xFilter === filter.key }}
                  onPress={() => setXFilter(filter.key)}
                  style={[
                    styles.subFilterChip,
                    xFilter === filter.key && styles.filterChipActive,
                  ]}
                >
                  <Text style={[
                    styles.filterText,
                    xFilter === filter.key && styles.filterTextActive,
                  ]}>{filter[lang]}</Text>
                </Pressable>
              ))}
            </HorizontalFilterRow>
          )}
        </View>

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
            <Text style={styles.muted}>{debouncedSearch ? searchLabels.empty : t('newsEmpty')}</Text>
          </View>
        )}

        {items.map((item) => (
          <Pressable
            key={item.id}
            style={styles.card}
            onPress={() => openNewsArticle(item)}
          >
            <View style={styles.newsTags}>
              <View style={styles.platformTag}>
                <Text style={styles.platformTagText}>
                  {getPlatformLabel(item.source_name)}
                </Text>
              </View>
              {item.source_name.startsWith('X - ') && (
                <View style={styles.accountTag}>
                  <Text style={styles.accountTagText}>
                    {item.source_name.slice(4)}
                  </Text>
                </View>
              )}
              <View style={styles.categoryTag}>
                <Text style={styles.category}>
                  {t(CATEGORY_KEYS[item.category])}
                </Text>
              </View>
            </View>
            <View style={styles.meta}>
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
              {language.startsWith('zh') ? '閱讀詳情' : language.startsWith('ja') ? '詳細を見る' : 'View details'} →
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: FanColors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: FanColors.text,
    fontSize: 15,
    paddingVertical: 12,
    minWidth: 0,
  },
  searchClear: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  searchClearText: {
    color: FanColors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  filters: { gap: 10, paddingVertical: 4 },
  filterRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
  filterChip: {
    flexShrink: 0,
    borderRadius: 12, borderWidth: 1, borderColor: FanColors.surfaceAlt,
    backgroundColor: FanColors.surface, paddingHorizontal: 13, paddingVertical: 10,
  },
  subFilterChip: {
    flexShrink: 0,
    borderRadius: 12, borderWidth: 1, borderColor: FanColors.surfaceAlt,
    backgroundColor: FanColors.surface, paddingHorizontal: 11, paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: FanColors.accent, borderColor: FanColors.accent,
  },
  filterText: { color: FanColors.text, fontSize: 12, fontWeight: '600' },
  filterTextActive: { color: FanColors.background },
  newsTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, alignItems: 'center' },
  platformTag: {
    minHeight: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: FanColors.surfaceAlt, borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  platformTagText: { color: FanColors.accent, fontSize: 11, lineHeight: 17, fontWeight: '700', includeFontPadding: false },
  accountTag: {
    minHeight: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: FanColors.surfaceAlt, borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  accountTagText: { color: FanColors.text, fontSize: 11, lineHeight: 17, includeFontPadding: false },
  categoryTag: {
    minHeight: 30, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: FanColors.accent, borderRadius: 7,
    paddingHorizontal: 9, paddingVertical: 5,
  },
  container: {
    flex: 1,
    backgroundColor: FanColors.background,
  },
  content: {
    width: '100%',
    maxWidth: 850,
    alignSelf: 'center',
    padding: 24,
    paddingTop: Platform.OS === 'web' ? 100 : 8,
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
    fontSize: 28,
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
