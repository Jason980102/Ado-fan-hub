import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type PushIdentity = { id: string; secret: string };
const IDENTITY_KEY = 'ado-restock-device-v1';
let identityPromise: Promise<PushIdentity> | null = null;

export async function getPushIdentity(): Promise<PushIdentity | null> {
  const raw = await SecureStore.getItemAsync(IDENTITY_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!/^[0-9a-f-]{36}$/i.test(value?.id) || !/^[0-9a-f]{64}$/.test(value?.secret)) return null;
  return value;
}

async function ensureIdentity(): Promise<PushIdentity> {
  if (!identityPromise) identityPromise = (async () => {
    const saved = await getPushIdentity();
    if (saved) return saved;
    const secret = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, '0')).join('');
    const identity = { id: Crypto.randomUUID(), secret };
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  })().finally(() => { identityPromise = null; });
  return identityPromise;
}

export async function preparePushDevice(projectId: string, askPermission = true): Promise<{ identity: PushIdentity; token: string }> {
  const ownProject = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (Constants.executionEnvironment === 'storeClient') throw new Error('push_development_build');
  if (!ownProject || ownProject !== projectId) throw new Error('push_not_configured');
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('restock', {
      name: '周邊補貨通知', importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && askPermission) permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('push_permission_denied');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return { identity: await ensureIdentity(), token };
}

export function observePush(onOpen: (themeSlug: string) => void, onTokenChange: () => void): () => void {
  Notifications.setNotificationHandler({ handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }) });
  let lastId: string | undefined;
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (response?.notification.request.content.data?.type !== 'restock') return;
    const id = response.notification.request.identifier;
    if (lastId === id) return;
    lastId = id;
    const theme = response.notification.request.content.data.themeSlug;
    if (typeof theme !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(theme)) return;
    onOpen(theme);
    void Notifications.clearLastNotificationResponseAsync();
  };
  handle(Notifications.getLastNotificationResponse());
  const response = Notifications.addNotificationResponseReceivedListener(handle);
  const token = Notifications.addPushTokenListener(onTokenChange);
  return () => { response.remove(); token.remove(); };
}
