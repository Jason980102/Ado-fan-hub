import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo, Animated, Pressable,
  type PressableProps,
} from 'react-native';

export default function AnimatedPressable({
  onPressIn, onPressOut, ...props
}: PressableProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(true);

  useEffect(() => {
    let active = true;
    let preferenceChanged = false;
    const update = (enabled: boolean) => {
      reduceMotion.current = enabled;
      if (enabled) {
        progress.stopAnimation();
        progress.setValue(0);
      }
    };
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        preferenceChanged = true;
        update(enabled);
      }
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (active && !preferenceChanged) update(enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
      progress.stopAnimation();
    };
  }, [progress]);

  function animate(pressed: boolean) {
    progress.stopAnimation();
    if (reduceMotion.current) {
      progress.setValue(0);
      return;
    }
    if (pressed) {
      Animated.timing(progress, {
        toValue: 1, duration: 100, useNativeDriver: true,
      }).start();
    } else {
      Animated.spring(progress, {
        toValue: 0, speed: 24, bounciness: 6, useNativeDriver: true,
      }).start();
    }
  }

  return (
    <Animated.View style={{
      opacity: progress.interpolate({
        inputRange: [0, 1], outputRange: [1, 0.8],
      }),
      transform: [{
        scale: progress.interpolate({
          inputRange: [0, 1], outputRange: [1, 0.97],
        }),
      }],
    }}>
      <Pressable {...props}
        onPressIn={(event) => {
          animate(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animate(false);
          onPressOut?.(event);
        }}
      />
    </Animated.View>
  );
}
