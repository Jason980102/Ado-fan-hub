import { useState } from 'react';
import { SvgUri } from 'react-native-svg';
import { Image, StyleSheet, View } from 'react-native';
import ExploreIcon from '@/components/explore-icon';
import { FanColors } from '@/constants/fan-theme';

type Source = 'x' | 'instagram' | 'niconico' | 'member' | 'shop';
const icons = { x: 'x', instagram: 'instagram', niconico: 'video', member: 'member', shop: 'shop' } as const;

export default function OfficialLinkImage({ source }: { source: Source }) {
  const [failed, setFailed] = useState(false);
  const base = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ANALYTICS_API_URL;
  const uri = base ? `${base.replace(/\/+$/, '')}/api/official-images/${source}?v=3` : null;
  return (
    <View style={[styles.frame, source === 'shop' && styles.siteFrame]}>
      {uri && !failed && source === 'member' ? (
        <SvgUri uri={uri} width={44} height={44} onError={() => setFailed(true)} />
      ) : uri && !failed ? (
        <Image source={{ uri }} onError={() => setFailed(true)}
          resizeMode={source === 'member' || source === 'shop' ? 'contain' : 'cover'}
          style={source === 'member' ? styles.siteIcon : source === 'shop' ? styles.shopLogo : styles.image} />
      ) : <ExploreIcon name={icons[source]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: 60, height: 60, flexShrink: 0, borderRadius: 30,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: FanColors.selected },
  siteFrame: { borderRadius: 14, backgroundColor: '#1b1b1b' },
  shopLogo: { width: 90, height: 90 },
  image: { width: '100%', height: '100%' },
  siteIcon: { width: 44, height: 44 },
});
