import { useRoseMotion } from '@/contexts/rose-motion-context';
import { forwardRef, type ComponentProps, type ComponentRef } from 'react';
import {
  Animated,
  Platform, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

const roses = {
  original: require('../../assets/images/blue-rose-icon.png'),
  left: require('../../assets/images/blue-rose-left.png'),
  right: require('../../assets/images/blue-rose-right.png'),
  bud: require('../../assets/images/blue-rose-bud.png'),
};

type SafePathProps = ComponentProps<typeof Path> & {
  collapsable?: boolean;
};

const AnimationSafePath = forwardRef<ComponentRef<typeof Path>, SafePathProps>(
  function AnimationSafePath({ collapsable, ...props }, ref) {
    return (
      <Path
        {...props}
        ref={ref}
        {...(Platform.OS !== 'web' && collapsable !== undefined
          ? { collapsable }
          : {})}
      />
    );
  }
);

const GrowingPath = Animated.createAnimatedComponent(AnimationSafePath);

function Vine({ growth }: { growth: Animated.Value }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 800"
      preserveAspectRatio="none"
      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : {})}>
      <GrowingPath d="M20 810 C85 690 -5 610 40 510 S80 350 35 240 S60 90 25 -10"
        fill="none" stroke="#568BB7" strokeWidth={2.2}
        strokeDasharray="1200 1200"
        strokeDashoffset={growth.interpolate({
          inputRange: [0, 1], outputRange: [1200, 0],
        })} />
      {[90, 210, 330, 450, 570, 690].map((y, index) => (
        <GrowingPath key={y}
          opacity={growth.interpolate({
            inputRange: [
              0, (800 - y) / 800 * 0.8,
              Math.min(1, (800 - y) / 800 * 0.8 + 0.16), 1,
            ],
            outputRange: [0, 0, 1, 1],
            extrapolate: 'clamp',
          })}
          d={index % 2 === 0
            ? `M38 ${y + 30} Q78 ${y + 6} 76 ${y - 20} Q36 ${y - 12} 38 ${y + 30} M38 ${y + 30} L66 ${y - 5}`
            : `M42 ${y + 30} Q2 ${y + 6} 8 ${y - 20} Q48 ${y - 12} 42 ${y + 30} M42 ${y + 30} L16 ${y - 5}`}
          fill="#1C5269" stroke="#4C91A9" strokeWidth={1.3}
          strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

function MobileCrossVine({ growth }: { growth: Animated.Value }) {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 800 48"
      preserveAspectRatio="none">
      <GrowingPath
        d="M0 24 C90 4 140 40 220 24 S350 8 420 24 S560 40 640 24 S740 8 800 24"
        fill="none" stroke="#568BB7" strokeWidth={2}
        strokeDasharray="900 900"
        strokeDashoffset={growth.interpolate({
          inputRange: [0, 1], outputRange: [900, 0],
        })}
      />
      {[110, 270, 450, 620].map((x, index) => (
        <GrowingPath key={x}
          d={index % 2 === 0
            ? `M${x} 24 Q${x + 14} 0 ${x + 40} 4 Q${x + 30} 25 ${x} 24`
            : `M${x} 24 Q${x + 14} 48 ${x + 40} 44 Q${x + 30} 23 ${x} 24`}
          fill="#1C5269" stroke="#4C91A9" strokeWidth={1}
          opacity={growth.interpolate({
            inputRange: [0, x / 800 * 0.8, x / 800 * 0.8 + 0.18, 1],
            outputRange: [0, 0, 1, 1],
            extrapolate: 'clamp',
          })}
        />
      ))}
    </Svg>
  );
}

export default function RoseBackground() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { growth, sway: progress } = useRoseMotion();
  const isWeb = Platform.OS === 'web';
  const edgeWidth = isWeb
    ? Math.min(110, Math.max(28, (width - 1280) / 2))
    : 28;
  const roseSize = Math.min(72, edgeWidth + 10);


  if (!isWeb) return null;

  return (
    <View pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden={true}
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {!isWeb && (['top', 'bottom'] as const).map((edge) => (
        <Animated.View key={edge} style={{
          position: 'absolute',
          left: 8,
          right: 8,
          height: 22,
          ...(edge === 'top'
            ? { top: insets.top + 44 }
            : { bottom: insets.bottom + 64 }),
          opacity: 0.3,
          transform: [
            { scaleX: edge === 'bottom' ? -1 : 1 },
            { scaleY: edge === 'bottom' ? -1 : 1 },
            { translateY: progress.interpolate({
              inputRange: [0, 1], outputRange: [-2, 2],
            }) },
          ],
        }}>
          <MobileCrossVine growth={growth} />
        </Animated.View>
      ))}
      {(['left', 'right'] as const).map((side) => (
        <Animated.View key={side} style={{
          position: 'absolute',
          top: insets.top + (isWeb ? 80 : 44),
          bottom: insets.bottom + (isWeb ? 10 : 64),
          width: edgeWidth,
          [side]: 0,
          opacity: isWeb && width >= 1100 ? 0.55 : 0.28,
          transform: [
            { scaleX: side === 'right' ? -1 : 1 },
            { translateY: progress.interpolate({
              inputRange: [0, 1], outputRange: [-6, 6],
            }) },
            { rotate: progress.interpolate({
              inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'],
            }) },
          ],
        }}>
          <Vine growth={growth} />
          {[
            {
              position: side === 'left' ? 0.15 : 0.23,
              source: side === 'left' ? roses.left : roses.right,
              angle: side === 'left' ? '-18deg' : '14deg',
              size: 1,
            },
            {
              position: side === 'left' ? 0.72 : 0.77,
              source: side === 'left' ? roses.bud : roses.original,
              angle: side === 'left' ? '22deg' : '-12deg',
              size: side === 'left' ? 0.82 : 0.92,
            },
          ].map((flower) => (
            <Animated.Image key={flower.position} source={flower.source} resizeMode="contain"
              style={{
                position: 'absolute',
                top: `${flower.position * 100}%`,
                left: -6,
                opacity: growth.interpolate({
                  inputRange: [
                    0, (1 - flower.position) * 0.8,
                    Math.min(1, (1 - flower.position) * 0.8 + 0.18), 1,
                  ],
                  outputRange: [0, 0, 1, 1],
                  extrapolate: 'clamp',
                }),
                width: roseSize * flower.size,
                height: roseSize * flower.size,
                transform: [
                  { scaleX: side === 'right' ? -1 : 1 },
                  { rotate: flower.angle },
                  { scale: growth.interpolate({
                    inputRange: [
                      0, (1 - flower.position) * 0.8,
                      Math.min(1, (1 - flower.position) * 0.8 + 0.18), 1,
                    ],
                    outputRange: [0.1, 0.1, 1, 1],
                    extrapolate: 'clamp',
                  }) },
                ],
              }} />
          ))}
        </Animated.View>
      ))}
    </View>
  );
}
