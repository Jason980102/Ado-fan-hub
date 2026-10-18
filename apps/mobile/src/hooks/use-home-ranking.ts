import { usePageData } from '@/hooks/use-page-data';
import { useCallback, useState } from 'react';

export type Result<T> = { attempt: number; data: T | null; error: boolean };

// Each endpoint settles independently; a failed growth request cannot hide total views.
export function useHomeRanking<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<Result<T> | null>(null);
  usePageData(useCallback(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 20000);
    void load(controller.signal).then(data => {
      if (active) setResult({ attempt, data, error: false });
    }).catch(() => {
      if (active) setResult(previous => ({ attempt, data: previous?.data ?? null, error: true }));
    }).finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [attempt, load]));
  return { current: result, retry: () => setAttempt(n => n + 1) };
}
