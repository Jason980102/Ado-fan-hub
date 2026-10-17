import AnimatedPressable from '@/components/animated-pressable';
import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { AnalyticsResponse } from '@/services/analytics-api';

type Props = {
  videos: AnalyticsResponse['videos'];
  formatNumber: (value: number | null) => string;
  onSelect: (id: string) => void;
};

const copy = {
  'zh-TW': {
    title: '所有 MV', all: '綜合', original: '原唱', cover: 'Cover',
    search: '搜尋 MV 標題…', clear: '清除搜尋',
    empty: '沒有符合條件的 MV。', count: '符合條件的 MV：',
    views: '觀看次數', image: '無縮圖',
    scope: '收錄指定原唱與 Cover 播放清單中可取得的影片。',
  },
  en: {
    title: 'All MVs', all: 'Overall', original: 'Original', cover: 'Cover',
    search: 'Search MV titles…', clear: 'Clear search',
    empty: 'No matching MVs.', count: 'Matching MVs: ',
    views: 'Views', image: 'No thumbnail',
    scope: 'Available videos from the selected Original and Cover playlists.',
  },
  ja: {
    title: 'すべてのMV', all: '総合', original: 'オリジナル', cover: 'カバー',
    search: 'MVタイトルを検索…', clear: '検索をクリア',
    empty: '該当するMVがありません。', count: '該当するMV：',
    views: '再生回数', image: '画像なし',
    scope: '指定のオリジナル・カバー再生リストから取得できた動画です。',
  },
};

const normalize = (value: string) => value.normalize('NFKC').toLowerCase();

export default function MvCatalog({ videos, formatNumber, onSelect }: Props) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const text = language.startsWith('zh') ? copy['zh-TW']
    : language.startsWith('ja') ? copy.ja : copy.en;
  const [category, setCategory] = useState<'all' | 'original' | 'cover'>('all');
  const [query, setQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'popular'>('newest');
  const sortLabels = language.startsWith('zh')
    ? { newest: '最新發布', oldest: '最早發布', popular: '熱門歌曲' }
    : language.startsWith('ja')
      ? { newest: '新しい順', oldest: '古い順', popular: '人気順' }
      : { newest: 'Newest', oldest: 'Oldest', popular: 'Most viewed' };
  const [failedImages, setFailedImages] = useState<Record<string, string>>({});
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const uniqueVideos = [...new Map(videos.map((video) => [video.id, video])).values()];
    function compareVideos(
    a: AnalyticsResponse['videos'][number],
    b: AnalyticsResponse['videos'][number]
  ) {
    if (sortOrder === 'popular') {
      if (a.view_count === null && b.view_count !== null) return 1;
      if (b.view_count === null && a.view_count !== null) return -1;
      const difference = (b.view_count ?? 0) - (a.view_count ?? 0);
      if (difference !== 0) return difference;
    }
    const dateDifference = Date.parse(b.published_at) - Date.parse(a.published_at);
    return (sortOrder === 'oldest' ? -dateDifference : dateDifference)
      || a.id.localeCompare(b.id);
  }

  const matches = uniqueVideos.sort(compareVideos).filter((video) =>
    (category === 'all' || video.categories.includes(category)) &&
    words.every((word) => normalize(video.title).includes(word))
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.muted}>{text.scope}</Text>
      <View style={styles.filters}>
        {(['all', 'original', 'cover'] as const).map((item) => (
          <AnimatedPressable key={item} accessibilityRole="button"
            accessibilityState={{ selected: category === item }}
            onPress={() => setCategory(item)}
            style={[styles.button, category === item && styles.selected]}>
            <Text style={styles.accent}>{text[item]}</Text>
          </AnimatedPressable>
        ))}
      </View>
      <TextInput value={query} onChangeText={setQuery}
        placeholder={text.search} accessibilityLabel={text.search}
        placeholderTextColor="#AAA6BC" autoCapitalize="none" autoCorrect={false}
        style={styles.input} />
      {query.length > 0 && (
        <AnimatedPressable accessibilityRole="button" onPress={() => setQuery('')}
          style={styles.button}>
          <Text style={styles.accent}>{text.clear}</Text>
        </AnimatedPressable>
      )}
      <View style={styles.filters}>
        {(['newest', 'oldest', 'popular'] as const).map((order) => (
          <AnimatedPressable key={order} accessibilityRole="button"
            accessibilityState={{ selected: sortOrder === order }}
            onPress={() => setSortOrder(order)}
            style={[styles.button, sortOrder === order && styles.selected]}>
            <Text style={styles.accent}>{sortLabels[order]}</Text>
          </AnimatedPressable>
        ))}
      </View>
      <Text style={styles.muted}>{text.count}{formatNumber(matches.length)}</Text>
      {matches.length === 0 && <Text style={styles.muted}>{text.empty}</Text>}
      {matches.map((video) => (
        <AnimatedPressable key={video.id} accessibilityRole="link"
          accessibilityLabel={`${video.title}, ${text.views}: ${formatNumber(video.view_count)}`}
          onPress={() => onSelect(video.id)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          {video.thumbnail_url && failedImages[video.id] !== video.thumbnail_url ? (
            <Image source={{ uri: video.thumbnail_url }} style={styles.image}
              resizeMode="cover" accessible={false}
              onError={() => setFailedImages((current) => ({
                ...current, [video.id]: video.thumbnail_url!,
              }))} />
          ) : (
            <View style={[styles.image, styles.fallback]}>
              <Text style={styles.muted}>{text.image}</Text>
            </View>
          )}
          <View style={styles.details}>
            <Text style={styles.song}>{video.title}</Text>
            <Text style={styles.accent}>
              {video.categories.map((item) => text[item]).join(' / ')}
            </Text>
            <Text style={styles.muted}>
              {text.views}: {formatNumber(video.view_count)}
            </Text>
          </View>
        </AnimatedPressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  muted: { color: '#AAA6BC', fontSize: 13, lineHeight: 20 },
  accent: { color: '#C8B4FF', fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { padding: 12, borderRadius: 12, backgroundColor: '#191923',
    borderWidth: 1, borderColor: '#393345', alignSelf: 'flex-start' },
  selected: { backgroundColor: '#302641', borderColor: '#C8B4FF' },
  input: { color: '#FFFFFF', backgroundColor: '#191923', borderRadius: 12,
    borderWidth: 1, borderColor: '#393345', padding: 14, fontSize: 16 },
  row: { flexDirection: 'column', gap: 14, padding: 16,
    backgroundColor: '#191923', borderRadius: 14, alignItems: 'flex-start' },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8,
    backgroundColor: '#292439' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', gap: 8 },
  song: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
