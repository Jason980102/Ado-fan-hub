import AsyncStorage from '@react-native-async-storage/async-storage';

import { fetchBudgetRates, isFxSnapshot, type FxSnapshot } from './budget';

const STORAGE_KEY = '@ado-fan-hub/fx-cache/v2';
const LEGACY_KEY = '@ado-fan-hub/fx-cache/v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

export type BudgetRateResult = { snapshot: FxSnapshot; stale: boolean };
type Cached = { snapshot: FxSnapshot; receivedAt: string };
let inFlight: Promise<BudgetRateResult> | null = null;

async function loadRateCache(): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (isFxSnapshot(saved?.snapshot) && typeof saved.receivedAt === 'string'
        && Number.isFinite(Date.parse(saved.receivedAt))) return saved;
    }
    // Old installed apps retain their offline estimate during migration.
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const old = JSON.parse(legacy);
      const snapshot = { ...old, checkedAt: old.fetchedAt, nextCheckAt: old.fetchedAt,
        stale: true, awaitingPublication: true };
      if (isFxSnapshot(snapshot)) return { snapshot, receivedAt: old.fetchedAt };
    }
  } catch { /* Invalid or inaccessible cache must not block live rates. */ }
  return null;
}

export function isRateCacheFresh(receivedAt: string, nextCheckAt: string, now = Date.now()): boolean {
  const received = Date.parse(receivedAt);
  const age = now - received;
  const current = new Date(now);
  const previous = new Date(received);
  return Number.isFinite(received) && age >= 0 && age < CACHE_TTL_MS
    && now < Date.parse(nextCheckAt)
    && current.toISOString().slice(0, 10) === previous.toISOString().slice(0, 10)
    && current.toDateString() === previous.toDateString();
}

async function readRates(force: boolean): Promise<BudgetRateResult> {
  const cached = await loadRateCache();
  if (!force && cached && isRateCacheFresh(cached.receivedAt, cached.snapshot.nextCheckAt)) {
    return { snapshot: cached.snapshot, stale: cached.snapshot.stale };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const snapshot = await fetchBudgetRates(controller.signal);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
        snapshot, receivedAt: new Date().toISOString(),
      }));
    } catch { /* A storage failure does not invalidate a live response. */ }
    return { snapshot, stale: snapshot.stale };
  } catch (error) {
    if (cached) return { snapshot: { ...cached.snapshot, stale: true }, stale: true };
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function withSignal<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const abort = () => {
      const error = new Error('Exchange rate request cancelled');
      error.name = 'AbortError';
      reject(error);
    };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function getBudgetRates(signal?: AbortSignal, force = false): Promise<BudgetRateResult> {
  // Cancelling one screen never cancels a shared request needed by another.
  if (signal?.aborted) return withSignal(Promise.resolve(null as never), signal);
  if (!inFlight) inFlight = readRates(force).finally(() => { inFlight = null; });
  return withSignal(inFlight, signal);
}
