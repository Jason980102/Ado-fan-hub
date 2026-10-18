export type PushIdentity = { id: string; secret: string };

// Browser push needs a separate service-worker/VAPID integration.
export async function getPushIdentity(): Promise<PushIdentity | null> { return null; }
export async function preparePushDevice(_projectId: string, _askPermission = true): Promise<{ identity: PushIdentity; token: string }> {
  throw new Error('push_unsupported');
}
export function observePush(_onOpen: (themeSlug: string) => void, _onTokenChange: () => void): () => void {
  return () => {};
}
