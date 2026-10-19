import { useState } from 'react';
import {
  Image, Linking, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { FanColors } from '@/constants/fan-theme';
import {
  OFFICIAL_PICKS_PLAYLIST_ID,
  type OfficialPicksResponse,
} from '@/services/official-picks-api';
import { officialPicksCopy } from '@/localization/official-picks-copy';

type Props = {
  data: OfficialPicksResponse;
};

export default function OfficialPicks({ data }: Props) {
  const { i18n } = useTranslation();
  const copy = officialPicksCopy(i18n.resolvedLanguage || i18n.language);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [linkError, setLinkError] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const columns = Platform.OS !== 'web' ? 1
    : gridWidth >= 1000 ? 3 : gridWidth >= 640 ? 2 : 1;
  const cardWidth = columns === 1
    ? '100%' as const
    : Math.floor((gridWidth - 12 * (columns - 1)) / columns);

  async function openUrl(url: string) {
    setLinkError(false);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError(true);
    }
  }

  const playlistUrl =
    `https://www.youtube.com/playlist?list=${OFFICIAL_PICKS_PLAYLIST_ID}`;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{copy.heading}</Text>
      <Text style={styles.description}>{copy.description}</Text>
      <Text style={styles.count}>{copy.count(data.videos.length)}</Text>

      {data.videos.length === 0 && (
        <Text style={styles.description}>{copy.empty}</Text>
      )}

      <View style={styles.grid} onLayout={(event) => {
        const width = event.nativeEvent.layout.width;
        setGridWidth((current) => Math.abs(current - width) > 1 ? width : current);
      }}>
        {data.videos.map((video) => (
          <Pressable
            key={video.id}
            accessibilityRole="link"
            accessibilityLabel={`${video.title}, ${copy.creator}: ${video.channel_title}`}
            onPress={() => void openUrl(video.url)}
            style={({ pressed }) => [
              styles.card,
              { width: cardWidth },
              pressed && styles.pressed,
            ]}
          >
            {video.thumbnail_url && !failedImages[video.id] ? (
              <Image
                source={{ uri: video.thumbnail_url }}
                style={styles.image}
                resizeMode="cover"
                accessible={false}
                onError={() => setFailedImages((current) => ({
                  ...current,
                  [video.id]: true,
                }))}
              />
            ) : (
              <View style={[styles.image, styles.fallback]}>
                <Text style={styles.description}>YouTube</Text>
              </View>
            )}
            <View style={styles.details}>
              <Text style={styles.videoTitle} numberOfLines={2}>
                {video.title}
              </Text>
              <Text style={styles.description} numberOfLines={1}>
                {copy.creator}: {video.channel_title}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => void openUrl(playlistUrl)}
        style={styles.playlistLink}
      >
        <Text style={styles.linkText}>{copy.openPlaylist} {'\u2197'}</Text>
      </Pressable>

      {linkError && (
        <Text accessibilityRole="alert" style={styles.description}>
          {playlistUrl}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
    gap: 10,
  },
  heading: {
    color: FanColors.text,
    fontSize: 23,
    fontWeight: '700',
  },
  description: {
    color: FanColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  count: {
    color: FanColors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: FanColors.surface,
    borderWidth: 1,
    borderColor: FanColors.border,
  },
  pressed: {
    opacity: 0.75,
  },
  image: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  fallback: {
    backgroundColor: FanColors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    padding: 12,
    gap: 5,
  },
  videoTitle: {
    color: FanColors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  playlistLink: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  linkText: {
    color: FanColors.accent,
    fontWeight: '600',
  },
});
