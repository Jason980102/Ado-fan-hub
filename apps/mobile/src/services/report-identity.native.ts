import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

let pending: Promise<string> | null = null;
export async function reportIdentity(): Promise<string> {
  if (!pending) pending = (async () => {
    const key = 'ado-reports-private-v1';
    const saved = await SecureStore.getItemAsync(key);
    if (saved && /^[0-9a-f]{64}$/.test(saved)) return saved;
    const secret = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(key, secret);
    return secret;
  })().finally(() => { pending = null; });
  return pending;
}
