import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useRouter } from 'expo-router';

import { observePush } from '@/services/push-device';
import { syncRestockDevice } from '@/services/restock';

export default function RestockObserver() {
  const router = useRouter();
  useEffect(() => {
    const sync = () => { void syncRestockDevice().catch(() => { /* Retry on next foreground without a permission prompt. */ }); };
    sync();
    const stop = observePush(themeSlug => router.push({ pathname: '/shop', params: { theme: themeSlug } }), sync);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') sync(); });
    return () => { stop(); foreground.remove(); };
  }, [router]);
  return null;
}
