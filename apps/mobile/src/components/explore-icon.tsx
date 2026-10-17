import { FanColors } from '@/constants/fan-theme';
import { Platform } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const paths = {
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  music: 'M9 18V5l12-3v13M9 8l12-3M9 18c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2ZM21 15c0 2-2 3-4 3s-3-1-3-2 2-3 4-3 3 1 3 2Z',
  heart: 'M12 21 3 12C-2 6 6 0 12 6 18 0 26 6 21 12Z',
  x: 'M4 3h4l12 18h-4ZM20 3 4 21',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM17.5 6.5h.01',
  video: 'M4 7h16v13H4ZM8 2l4 5 4-5M9 11l6 3-6 3Z',
  member: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2',
  shop: 'M4 8h16l1 13H3ZM8 8V6a4 4 0 0 1 8 0v2',
};

export default function ExploreIcon({
  name,
}: { name: keyof typeof paths }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessible: false })}>
      <Path d={paths[name]} fill="none" stroke={FanColors.accent}
        strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
