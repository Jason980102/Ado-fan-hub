import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Animated, AppState, Easing } from 'react-native';

type Reason = 'refresh' | 'login';
type Motion = {
  growth: Animated.Value;
  sway: Animated.Value;
  restartGrowth: (reason?: Reason) => void;
};
const RoseMotionContext = createContext<Motion | null>(null);
const DURATION = 8500;

export function RoseMotionProvider({ children }: { children: ReactNode }) {
  const growth = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const restart = useRef<() => void>(() => {});
  const restartGrowth = useCallback((_reason: Reason = 'refresh') => restart.current(), []);

  useEffect(() => {
    let alive = true;
    let ready = false;
    let reduced = true;
    let preferenceChanged = false;
    let active = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    let startedAt: number | null = null;
    let generation = 0;
    let entrance: Animated.CompositeAnimation | undefined;
    let breeze: Animated.CompositeAnimation | undefined;

    function startBreeze(run: number) {
      if (!alive || !active || reduced || run !== generation) return;
      breeze = Animated.loop(Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 6500,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: 0, duration: 6500,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      breeze.start();
    }

    function update() {
      const run = ++generation;
      entrance?.stop();
      breeze?.stop();
      sway.setValue(0);
      if (!alive || !ready) return;
      if (reduced) {
        startedAt = Date.now() - DURATION;
        growth.setValue(1);
        return;
      }
      if (!active) return;
      startedAt ??= Date.now();
      const elapsed = Math.min(DURATION, Date.now() - startedAt);
      growth.setValue(elapsed / DURATION);
      if (elapsed >= DURATION) {
        startBreeze(run);
        return;
      }
      entrance = Animated.timing(growth, {
        toValue: 1, duration: DURATION - elapsed,
        easing: Easing.linear, useNativeDriver: false,
      });
      entrance.start(({ finished }) => { if (finished) startBreeze(run); });
    }

    restart.current = () => {
      startedAt = Date.now();
      update();
    };
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      preferenceChanged = true;
      ready = true;
      reduced = value;
      update();
    });
    const app = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      update();
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!alive || preferenceChanged) return;
      ready = true;
      reduced = value;
      update();
    }).catch(() => { if (alive) { ready = true; reduced = true; update(); } });
    return () => {
      alive = false;
      ++generation;
      restart.current = () => {};
      entrance?.stop(); breeze?.stop();
      motion.remove(); app.remove();
    };
  }, [growth, sway]);

  const value = useMemo(() => ({ growth, sway, restartGrowth }), [growth, sway, restartGrowth]);
  return <RoseMotionContext.Provider value={value}>{children}</RoseMotionContext.Provider>;
}

export function useRoseMotion() {
  const value = useContext(RoseMotionContext);
  if (!value) throw new Error('RoseMotionProvider is required');
  return value;
}
