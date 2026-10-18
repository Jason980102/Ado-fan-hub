import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPushIdentity, preparePushDevice, type PushIdentity } from './push-device';

export type RestockSubscription = { themeSlug: string; productSlug: string };
const LANGUAGE_KEY = '@ado-fan-hub/restock-language/v1';

async function request(path: string, method = 'GET', body?: unknown, identity?: PushIdentity, signal?: AbortSignal) {
  const base = process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ANALYTICS_API_URL;
  if (!base) throw new Error('push_api_unavailable');
  if (identity && !/^https:\/\//i.test(base) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(base)) {
    throw new Error('push_https_required');
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/api/push/${path}`, {
      method, signal: controller.signal,
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(identity ? { Authorization: `Bearer ${identity.secret}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(response.status === 409 ? 'push_product_changed' : 'push_api_unavailable');
    return await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function loadRestockSubscriptions(signal?: AbortSignal): Promise<RestockSubscription[]> {
  const identity = await getPushIdentity();
  if (!identity) return [];
  const result = await request(`devices/${identity.id}/subscriptions`, 'GET', undefined, identity, signal);
  if (!Array.isArray(result?.subscriptions) || result.subscriptions.length > 100 || !result.subscriptions.every(
    (item: RestockSubscription) => /^[A-Za-z0-9_-]{1,80}$/.test(item?.themeSlug) && /^[A-Za-z0-9_-]{1,80}$/.test(item?.productSlug),
  )) throw new Error('push_invalid_response');
  return result.subscriptions;
}

export async function setRestockSubscription(themeSlug: string, productSlug: string, enabled: boolean, language: string): Promise<void> {
  if (![themeSlug, productSlug].every(value => /^[A-Za-z0-9_-]{1,80}$/.test(value))) throw new Error('push_invalid_product');
  let identity = await getPushIdentity();
  if (enabled) {
    const config = await request('config');
    if (config?.enabled !== true || typeof config.projectId !== 'string') throw new Error('push_not_configured');
    const device = await preparePushDevice(config.projectId);
    identity = device.identity;
    const lang = language.startsWith('zh') ? 'zh' : language.startsWith('ja') ? 'ja' : 'en';
    await request(`devices/${identity.id}`, 'PUT', { token: device.token, language: lang }, identity);
    await AsyncStorage.setItem(LANGUAGE_KEY, lang);
  }
  if (!identity) return;
  const result = await request(`devices/${identity.id}/subscriptions`, 'PUT', { themeSlug, productSlug, enabled }, identity);
  if (result?.enabled !== enabled) throw new Error('push_invalid_response');
}

let syncing: Promise<void> | null = null;
export function syncRestockDevice(): Promise<void> {
  if (!syncing) syncing = (async () => {
    const identity = await getPushIdentity();
    if (!identity) return;
    const config = await request('config');
    if (!config?.enabled || typeof config.projectId !== 'string') return;
    let device;
    try { device = await preparePushDevice(config.projectId, false); }
    catch (error) {
      if (error instanceof Error && error.message === 'push_permission_denied') {
        await request(`devices/${identity.id}`, 'DELETE', undefined, identity);
        return;
      }
      throw error;
    }
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    const language = ['zh', 'en', 'ja'].includes(savedLanguage || '') ? savedLanguage : 'zh';
    await request(`devices/${identity.id}`, 'PUT', { token: device.token, language }, identity);
  })().finally(() => { syncing = null; });
  return syncing;
}
