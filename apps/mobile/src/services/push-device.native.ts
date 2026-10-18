import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type PushIdentity = { id: string; secret: string };
type NativeDependencies = {
  Notifications: typeof import('expo-notifications');
  Crypto: typeof import('expo-crypto');
  SecureStore: typeof import('expo-secure-store');
};
const IDENTITY_KEY = 'ado-restock-device-v1';
let identityPromise: Promise<PushIdentity> | null = null;
let dependencies: Promise<NativeDependencies> | null = null;

function configuredProject(): string | null {
  if (Constants.executionEnvironment === 'storeClient') return null;
  const project = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof project === 'string' && project.length > 0 ? project : null;
}

function loadDependencies(): Promise<NativeDependencies> {
  if (!dependencies) dependencies = Promise.all([
    import('expo-notifications'), import('expo-crypto'), import('expo-secure-store'),
  ]).then(([Notifications, Crypto, SecureStore]) => ({ Notifications, Crypto, SecureStore }))
    .catch(error => { dependencies = null; throw error; });
  return dependencies;
}

export async function getPushIdentity(): Promise<PushIdentity | null> {
  // Ordinary app startup and Expo Go must not initialize remote push modules.
  if (!configuredProject()) return null;
  const { SecureStore } = await loadDependencies();
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
    const { Crypto, SecureStore } = await loadDependencies();
    const secret = Array.from(await Crypto.getRandomBytesAsync(32), b => b.toString(16).padStart(2, '0')).join('');
    const identity = { id: Crypto.randomUUID(), secret };
    await SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity));
    return identity;
  })().finally(() => { identityPromise = null; });
  return identityPromise;
}

export async function preparePushDevice(projectId: string, askPermission = true): Promise<{ identity: PushIdentity; token: string }> {
  if (Constants.executionEnvironment === 'storeClient') throw new Error('push_development_build');
  if (configuredProject() !== projectId) throw new Error('push_not_configured');
  const { Notifications } = await loadDependencies();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('restock', {
      name: '周邊補貨通知', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default',
    });
  }
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted' && askPermission) permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('push_permission_denied');
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  return { identity: await ensureIdentity(), token };
}

export function observePush(onOpen: (themeSlug: string) => void, onTokenChange: () => void): () => void {
  if (!configuredProject()) return () => {};
  let disposed = false;
  let stop = () => {};
  void loadDependencies().then(({ Notifications }) => {
    if (disposed) return;
    Notifications.setNotificationHandler({ handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }) });
    let lastId: string | undefined;
    const handle = (response: import('expo-notifications').NotificationResponse | null) => {
      if (response?.notification.request.content.data?.type !== 'restock') return;
      const id = response.notification.request.identifier;
      if (lastId === id) return;
      lastId = id;
      const theme = response.notification.request.content.data.themeSlug;
      if (typeof theme !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(theme)) return;
      onOpen(theme);
      void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    const response = Notifications.addNotificationResponseReceivedListener(handle);
    const token = Notifications.addPushTokenListener(onTokenChange);
    stop = () => { response.remove(); token.remove(); };
    handle(Notifications.getLastNotificationResponse());
  }).catch(() => { /* Push initialization must never prevent the app from opening. */ });
  return () => { disposed = true; stop(); };
}
