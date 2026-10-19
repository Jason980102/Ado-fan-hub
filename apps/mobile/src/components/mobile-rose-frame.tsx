import { useRoseMotion } from '@/contexts/rose-motion-context';
import { forwardRef, useState, type ComponentProps, type ComponentRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

const flowers = [
  { source: require('../../assets/images/blue-rose-left.png'), side: 'left', position: 0.22, angle: '-18deg' },
  { source: require('../../assets/images/blue-rose-bud.png'), side: 'left', position: 0.73, angle: '20deg' },
  { source: require('../../assets/images/blue-rose-right.png'), side: 'right', position: 0.34, angle: '14deg' },
  { source: require('../../assets/images/blue-rose-icon.png'), side: 'right', position: 0.82, angle: '-12deg' },
] as const;

type SafeProps = ComponentProps<typeof Path> & { collapsable?: boolean };
const SafePath = forwardRef<ComponentRef<typeof Path>, SafeProps>(
  function SafePath({ collapsable, ...props }, ref) {
    return <Path {...props} ref={ref}
      {...(Platform.OS !== 'web' && collapsable !== undefined ? { collapsable } : {})} />;
  }
);
const AnimatedPath = Animated.createAnimatedComponent(SafePath);

export default function MobileRoseFrame({ staticMode = false }: { staticMode?: boolean }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const staticGrowth = useState(() => new Animated.Value(1))[0];
  const staticSway = useState(() => new Animated.Value(0))[0];
  const motion = useRoseMotion();
  const growth = staticMode ? staticGrowth : motion.growth;
  const sway = staticMode ? staticSway : motion.sway;


  if (Platform.OS === 'web') return null;
  const w = size.width;
  const h = Math.min(size.height, 1400);
  type Point = { x: number; y: number };
  const makeVine = (side: 'left' | 'right') => {
    const right = side === 'right';
    const bottom = h - 18;
    // Unequal tendrils curl inward at their ends rather than closing a frame.
    const points: Point[] = [
      { x: w * (right ? 0.28 : 0.37), y: bottom - (right ? 12 : 0) },
      { x: 42, y: bottom - (right ? 5 : 24) },
      { x: 13, y: h * 0.91 },
      { x: right ? 19 : 7, y: h * 0.75 },
      { x: right ? 6 : 18, y: h * 0.57 },
      { x: right ? 16 : 8, y: h * 0.39 },
      { x: right ? 8 : 17, y: h * 0.21 },
      { x: right ? 24 : 13, y: 66 },
      { x: right ? 52 : 38, y: right ? 24 : 33 },
      { x: w * (right ? 0.35 : 0.25), y: right ? 20 : 15 },
      { x: w * (right ? 0.43 : 0.36), y: right ? 12 : 26 },
    ];
    const samples: (Point & { distance: number })[] = [{ ...points[0], distance: 0 }];
    let d = `M ${points[0].x} ${points[0].y}`;
    let length = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const before = points[Math.max(0, i - 1)];
      const a = points[i];
      const b = points[i + 1];
      const after = points[Math.min(points.length - 1, i + 2)];
      const c1 = { x: a.x + (b.x - before.x) / 6, y: a.y + (b.y - before.y) / 6 };
      const c2 = { x: b.x - (after.x - a.x) / 6, y: b.y - (after.y - a.y) / 6 };
      d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
      for (let step = 1; step <= 24; step++) {
        const t = step / 24;
        const u = 1 - t;
        const p = {
          x: u ** 3 * a.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * b.x,
          y: u ** 3 * a.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * b.y,
        };
        const previous = samples[samples.length - 1];
        length += Math.hypot(p.x - previous.x, p.y - previous.y);
        samples.push({ ...p, distance: length });
      }
    }
    return { d, length: Math.max(1, length), samples };
  };
  const vines = { left: makeVine('left'), right: makeVine('right') };
  const appear = (start: number) => growth.interpolate({
    inputRange: [0, start, Math.min(1, start + 0.12), 1],
    outputRange: [0, 0, 1, 1], extrapolate: 'clamp',
  });
  const count = Math.max(4, Math.floor(h / 125));

  return (
    <View pointerEvents="none" accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((old) => old.width === width && old.height === height ? old : { width, height });
      }}
      style={[StyleSheet.absoluteFill, { bottom: 28 }]}>
      {w > 0 && h > 100 && (
        <Animated.View style={[{
          position: 'absolute',
          top: 0,
          left: 0,
          width: w,
          height: h,
          opacity: 0.4,
          transform: [{ translateX: sway.interpolate({ inputRange: [0, 1], outputRange: [-1.5, 1.5] }) }],
        }]}>
          <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
            {(['left', 'right'] as const).map((side) => {
              const vine = vines[side];
              return (
                <G key={side} transform={side === 'right' ? `translate(${w} 0) scale(-1 1)` : undefined}>
                  <AnimatedPath d={vine.d} fill="none" stroke="#568BB7" strokeWidth={1.1}
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={`${vine.length} ${vine.length}`}
                    strokeDashoffset={growth.interpolate({ inputRange: [0, 1], outputRange: [vine.length, 0] })} />
                  {Array.from({ length: count }, (_, i) => {
                    const fraction = 0.09 + i / Math.max(1, count - 1) * 0.83;
                    const p = vine.samples.find((sample) => sample.distance >= fraction * vine.length)!;
                    const reach = i % 3 === 0 ? 17 : 12;
                    const angle = i % 2 === 0 ? -1 : 1;
                    // Each small offshoot starts on the actual curved stem.
                    return (
                      <G key={i}>
                        <AnimatedPath
                          d={`M${p.x} ${p.y} Q${p.x + 5} ${p.y + angle * 3} ${p.x + reach * 0.55} ${p.y + angle * 9}`}
                          fill="none" stroke="#568BB7" strokeWidth={0.7} opacity={appear(fraction)} />
                        <AnimatedPath
                          d={`M${p.x + reach * 0.55} ${p.y + angle * 9} Q${p.x + reach + 2} ${p.y + angle * 3} ${p.x + reach + 4} ${p.y + angle * 21} Q${p.x + 7} ${p.y + angle * 22} ${p.x + reach * 0.55} ${p.y + angle * 9}`}
                          fill="#1C5269" stroke="#4C91A9" strokeWidth={0.6} opacity={appear(fraction)} />
                      </G>
                    );
                  })}
                </G>
              );
            })}
          </Svg>
          {flowers.map((flower, index) => {
            const vine = vines[flower.side];
            const attachment = vine.samples.reduce((best, sample) =>
              Math.abs(sample.y - h * flower.position) < Math.abs(best.y - h * flower.position) ? sample : best
            );
            const start = Math.min(0.85, attachment.distance / vine.length);
            return <Animated.Image key={index} source={flower.source} resizeMode="contain"
              style={{
                position: 'absolute', top: attachment.y - 17,
                ...(flower.side === 'left' ? { left: attachment.x - 17 } : { right: attachment.x - 17 }),
                width: 34, height: 34, opacity: appear(start),
                transform: [{ rotate: flower.angle }, {
                  scale: growth.interpolate({
                    inputRange: [0, start, Math.min(1, start + 0.12), 1],
                    outputRange: [0.1, 0.1, 1, 1], extrapolate: 'clamp',
                  })
                }],
              }} />;
          })}
        </Animated.View>
      )}
    </View>
  );
}
