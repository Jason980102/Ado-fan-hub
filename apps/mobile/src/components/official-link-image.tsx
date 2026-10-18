// M07_BRAND_FALLBACK_V2
import { useEffect, useState } from 'react';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { SvgUri } from 'react-native-svg';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import ExploreIcon from '@/components/explore-icon';
import { FanColors } from '@/constants/fan-theme';
import { officialLinkAssets } from '@/constants/official-link-assets';

type Source =
  | 'x' | 'instagram' | 'niconico' | 'member' | 'shop'
  | 'universal' | 'cloud9' | 'tiktok' | 'spotify' | 'apple-music' | 'line' | 'discord';

const icons = {
  x: 'x', instagram: 'instagram', niconico: 'video',
  member: 'member', shop: 'shop', universal: 'member', cloud9: 'member',
  tiktok: 'music', spotify: 'music', 'apple-music': 'music', line: 'member', discord: 'member',
} as const;

const brandBackgrounds: Partial<Record<Source, string>> = {
  tiktok: '#101010',
  spotify: '#1DB954',
  'apple-music': '#FA243C',
  line: '#06C755',
  discord: '#5865F2',
};

export default function OfficialLinkImage({ source }: { source: Source }) {
  return <OfficialLinkImageContent key={source} source={source} />;
}

function OfficialLinkImageContent({ source }: { source: Source }) {
  const [failed, setFailed] = useState(false);
  const [discordIcon, setDiscordIcon] = useState<string | null>(null);
  const local = officialLinkAssets[source];
  const base = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ANALYTICS_API_URL;

  // Only these existing profile sources use the backend image endpoint.
  // Spotify / Apple Music / LINE fall back to their *brand icons*, never X's avatar.
  const hasBackendImage = ['x', 'instagram', 'niconico', 'tiktok', 'member', 'shop'].includes(source);
  const remoteUri = source === 'discord'
    ? discordIcon
    : hasBackendImage && base
      ? `${base.replace(/\/+$/, '')}/api/official-images/${source}?v=${source === 'tiktok' ? Math.floor(Date.now() / 86400000) : 3}`
      : null;

  useEffect(() => {
    if (source !== 'discord' || officialLinkAssets.discord) return;
    let active = true;
    async function resolveIcon() {
      try {
        const response = await fetch('https://discord.com/api/v10/invites/ado1024');
        if (!response.ok) return;
        const data: { guild?: { id?: string; icon?: string } } = await response.json();
        const guild = data.guild;
        if (active && guild?.id === '865372252433940500' &&
            typeof guild.icon === 'string' && /^[a-zA-Z0-9_]+$/.test(guild.icon)) {
          setDiscordIcon(`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`);
        }
      } catch {
        // The local brand icon remains available if public API access fails.
      }
    }
    void resolveIcon();
    return () => { active = false; };
  }, [source]);

  const imageSource: ImageSourcePropType | null = !failed
    ? (local ?? (remoteUri ? { uri: remoteUri } : null))
    : null;
  const brandIcon = source === 'tiktok' ? 'tiktok'
    : source === 'spotify' ? 'spotify'
    : source === 'apple-music' ? 'itunes-note'
      : source === 'line' ? 'line'
        : source === 'discord' ? 'discord'
          : null;
  const brandBackground = brandBackgrounds[source];

  return (
    <View style={[
      styles.frame,
      (source === 'shop' || source === 'universal') && styles.darkFrame,
      !imageSource && brandBackground && { backgroundColor: brandBackground },
    ]}>
      {remoteUri && !local && !failed && source === 'member' ? (
        <SvgUri uri={remoteUri} width={44} height={44} onError={() => setFailed(true)} />
      ) : imageSource ? (
        <Image
          source={imageSource}
          onError={() => setFailed(true)}
          resizeMode={source === 'shop' || source === 'universal' ? 'contain' : 'cover'}
          style={source === 'shop' ? styles.shopLogo
            : source === 'universal' ? styles.universalLogo : styles.image}
        />
      ) : brandIcon ? (
        <FontAwesome5 name={brandIcon} size={29} color="#FFFFFF" />
      ) : (
        <ExploreIcon name={icons[source]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 60, height: 60, flexShrink: 0, borderRadius: 30,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: FanColors.selected },
  darkFrame: { backgroundColor: '#101010' },
  image: { width: '100%', height: '100%' },
  // Zoom the wordmark within the circular viewport, without changing the card layout.
  shopLogo: { width: 108, height: 108 },
  // Contain the full record-company logo rather than cropping its lettering.
  universalLogo: { width: 52, height: 52 },
});
