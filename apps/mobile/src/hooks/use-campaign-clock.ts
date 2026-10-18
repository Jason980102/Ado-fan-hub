import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** React at the exact nearest deadline, and recover after suspended timers. */
export function useCampaignClock(deadlines: (string | null | undefined)[]): number {
  const [now, setNow] = useState(Date.now);
  const key = [...new Set(deadlines.filter((d): d is string => !!d))].sort().join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const current = Date.now();
      const remaining = key.split(',').map(Date.parse).filter(t => Number.isFinite(t) && t > current);
      timer = setTimeout(() => { setNow(Date.now()); schedule(); },
        Math.max(1, Math.min(60000, ...remaining.map(t => t - current))));
    };
    schedule();
    const foreground = AppState.addEventListener('change', state => {
      if (state === 'active') { clearTimeout(timer); setNow(Date.now()); schedule(); }
    });
    return () => { clearTimeout(timer); foreground.remove(); };
  }, [key]);
  return now;
}
