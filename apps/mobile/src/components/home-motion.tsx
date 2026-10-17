import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useRoseMotion } from '@/contexts/rose-motion-context';
import { FanColors } from '@/constants/fan-theme';

export function HeroGeometry() {
  const { sway } = useRoseMotion();
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}
    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
    {[{ top: 24, right: 34, size: 32 }, { top: 70, right: 64, size: 20 }, { bottom: 22, left: 28, size: 24 }, { bottom: 35, right: 24, size: 44 }].map((square, index) => {
      const { size, ...position } = square;
      return <Animated.View key={index} style={[styles.square, position, {
        width: size, height: size,
        transform: [
          { translateY: sway.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [-7, 7] : [7, -7] }) },
          { rotate: sway.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? ['-8deg', '8deg'] : ['8deg', '-8deg'] }) },
        ],
      }]} />;
    })}
  </View>;
}

export function MotionShortcut({ index, children, onPress, style }: {
  index: number; children: ReactNode; onPress: () => void; style: StyleProp<ViewStyle>;
}) {
  const { sway } = useRoseMotion();
  const [interaction] = useState(() => new Animated.Value(0));
  const reduced = useRef(true);
  const [highlighted, setHighlighted] = useState(false);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const update = (value: boolean) => {
      reduced.current = value;
      if (value) { interaction.stopAnimation(); interaction.setValue(0); }
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; update(value); });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive && !changed) update(value); }).catch(() => {});
    return () => { alive = false; subscription.remove(); interaction.stopAnimation(); };
  }, [interaction]);
  function feedback(value: number) {
    setHighlighted(value !== 0);
    if (reduced.current) return;
    Animated.spring(interaction, { toValue: value, speed: 28, bounciness: 3, useNativeDriver: true }).start();
  }
  return <Animated.View style={[styles.cell, {
    transform: [
      { translateY: sway.interpolate({ inputRange: [0, 1], outputRange: index % 2 ? [-2, 2] : [2, -2] }) },
      { translateY: interaction.interpolate({ inputRange: [-1, 0, 1], outputRange: [1, 0, -4] }) },
      { scale: interaction.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.98, 1, 1.015] }) },
    ],
  }]}>
    <Pressable accessibilityRole="button" onPress={onPress}
      onHoverIn={() => feedback(1)} onHoverOut={() => feedback(0)}
      onFocus={() => feedback(1)} onBlur={() => feedback(0)}
      onPressIn={() => feedback(-1)} onPressOut={() => feedback(0)}
      style={[style, styles.button, highlighted && styles.highlight]}>
      <View pointerEvents="none" style={styles.corner} />
      {children}
    </Pressable>
  </Animated.View>;
}
const styles = StyleSheet.create({
  cell: { flex: 1, minWidth: 0 },
  button: { flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(123,179,255,0.12)' },
  highlight: { borderColor: FanColors.accent, backgroundColor: FanColors.surfaceAlt },
  square: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(146,194,255,0.6)', backgroundColor: 'rgba(81,151,255,0.12)' },
  corner: { position: 'absolute', right: -12, top: -12, width: 52, height: 52, borderWidth: 1, borderColor: 'rgba(123,179,255,0.22)', transform: [{ rotate: '24deg' }] },
});
