import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { AppState, Platform } from 'react-native';

type Cleanup = void | (() => void);
const refreshListeners = new Set<() => void>();

/** Refresh all data displayed by the focused page, including home widgets. */
export function refreshPageData() {
  for (const refresh of [...refreshListeners]) refresh();
}

/** Fetch on entry and foreground; retain screen state and stop work on blur. */
export function usePageData(effect: () => Cleanup) {
  useFocusEffect(useCallback(() => {
    let cleanup: Cleanup;
    let disposed = false;
    let state = AppState.currentState;
    let lastRefresh = 0;
    const refresh = () => {
      if (disposed) return;
      cleanup?.();
      lastRefresh = Date.now();
      cleanup = effect();
    };
    const foreground = () => {
      // Native and browser visibility events can describe the same transition.
      if (Date.now() - lastRefresh > 500) refresh();
    };
    if (state === 'active' || state === null) refresh();
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active' && state !== 'active') refresh();
      state = next;
    });
    const visibility = () => {
      if (document.visibilityState === 'visible') foreground();
    };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', visibility);
    refreshListeners.add(refresh);
    return () => {
      disposed = true;
      refreshListeners.delete(refresh);
      listener.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', visibility);
      cleanup?.();
    };
  }, [effect]));
}
