import { FanColors } from '@/constants/fan-theme';
import AnimatedPressable from '@/components/animated-pressable';
import { useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { mvCategories, type CatalogVideo, type MvCategory } from '@/services/mv-api';
import { indexMvVideos, searchMvVideos, type MvSort } from '@/services/mv-search';
import { mvCopy } from '@/localization/mv-copy';
import { usePreferences } from '@/contexts/preferences-context';

type Props = {
  videos: CatalogVideo[];
  formatNumber: (value: number | null) => string;
  onSelect: (id: string) => void;
};

export default function MvCatalog({ videos, formatNumber, onSelect }: Props) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const text = mvCopy(language);
  const { preferences } = usePreferences();
  const [category, setCategory] = useState<MvCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [gridWidth, setGridWidth] = useState(0);
  const columns = Platform.OS !== 'web' ? 1
    : gridWidth >= 1000 ? 3 : gridWidth >= 640 ? 2 : 1;
  const cardWidth = columns === 1 ? '100%'
    : Math.floor((gridWidth - 16 * (columns - 1)) / columns);
  const [sortOrder, setSortOrder] = useState<MvSort>('newest');
  const [failedImages, setFailedImages] = useState<Record<string, string>>({});
  const index = useMemo(() => indexMvVideos(videos), [videos]);
  const matches = useMemo(() => searchMvVideos(index, query, category, sortOrder), [index, query, category, sortOrder]);
  const filterKey = JSON.stringify([query, category, sortOrder]);
  const [page, setPage] = useState({ key: '', limit: 24 });
  const limit = page.key === filterKey ? page.limit : 24;
  function date(value: string) {
    return new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: preferences.timeZone,
    }).format(new Date(value));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{text.title}</Text>
      <Text style={styles.muted}>{text.scope}</Text>
      <View style={styles.filters}>
        {(['all', ...mvCategories] as const).map((item) => (
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
        placeholderTextColor={FanColors.muted} autoCapitalize="none" autoCorrect={false}
        returnKeyType="search" style={styles.input} />
      <Text style={styles.muted}>{text.hint}</Text>
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
            <Text style={styles.accent}>{text[order]}</Text>
          </AnimatedPressable>
        ))}
      </View>
      <Text style={styles.muted}>{text.count}{formatNumber(matches.length)}</Text>
      {matches.length === 0 && <View style={styles.details}>
        <Text style={styles.muted}>{text.empty}</Text>
        {(query.length > 0 || category !== 'all') && <AnimatedPressable accessibilityRole="button"
          onPress={() => { setQuery(''); setCategory('all'); }} style={styles.button}>
          <Text style={styles.accent}>{text.reset}</Text>
        </AnimatedPressable>}
      </View>}
      <View style={styles.grid} onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setGridWidth((current) => Math.abs(current - width) > 1 ? width : current);
      }}>
      {matches.slice(0, limit).map((video) => (
        <View key={video.id} style={{ width: cardWidth }}>
        <AnimatedPressable accessibilityRole="link"
          accessibilityLabel={`${video.title}, ${text.views}: ${formatNumber(video.view_count)}, ${text.likes}: ${formatNumber(video.like_count)}`}
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
            <Text style={styles.muted}>{text.published}: {date(video.published_at)}</Text>
            <Text style={styles.muted}>{video.channel_title}</Text>
            <Text style={styles.muted}>
              {text.views}: {formatNumber(video.view_count)}
            </Text>
            <Text style={styles.muted}>{text.likes}: {formatNumber(video.like_count)}</Text>
            <Text style={styles.accent}>{text.watch}</Text>
          </View>
        </AnimatedPressable>
        </View>
      ))}
      </View>
      {matches.length > limit && <AnimatedPressable accessibilityRole="button"
        onPress={() => setPage({ key: filterKey, limit: limit + 24 })} style={styles.button}>
        <Text style={styles.accent}>{text.more}</Text>
      </AnimatedPressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  title: { color: FanColors.text, fontSize: 20, fontWeight: '700' },
  muted: { color: FanColors.muted, fontSize: 13, lineHeight: 20 },
  accent: { color: FanColors.accent, fontSize: 13 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  button: { padding: 12, borderRadius: 12, backgroundColor: FanColors.surface,
    borderWidth: 1, borderColor: FanColors.border, alignSelf: 'flex-start' },
  selected: { backgroundColor: FanColors.selected, borderColor: FanColors.accent },
  input: { color: FanColors.text, backgroundColor: FanColors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: FanColors.border, padding: 14, fontSize: 16 },
  row: { flexDirection: 'column', gap: 14, padding: 16,
    backgroundColor: FanColors.surface, borderRadius: 14, alignItems: 'flex-start' },
  image: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8,
    backgroundColor: FanColors.surfaceAlt },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  details: { width: '100%', gap: 8 },
  song: { color: FanColors.text, fontSize: 16, lineHeight: 24, fontWeight: '600' },
  pressed: { opacity: 0.7 },
});
