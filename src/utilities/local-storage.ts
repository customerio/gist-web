import { log } from './log';

const maxExpiryDays = 365;

export const STORAGE_KEYS = {
  userToken: 'gist.web.userToken',
  usingGuestUserToken: 'gist.web.usingGuestUserToken',
  guestUserToken: 'gist.web.guestUserToken',
  userQueueNextPullCheck: 'gist.web.userQueueNextPullCheck',
  sessionId: 'gist.web.sessionId',
  isPersistingSession: 'gist.web.isPersistingSession',
  userQueueUseSSE: 'gist.web.userQueueUseSSE',
  activeSSEConnection: 'gist.web.activeSSEConnection',
  userLocale: 'gist.web.userLocale',
  customAttributes: 'gist.web.customAttributes',

  messageBroadcasts: 'gist.web.message.broadcasts',
  messageUser: 'gist.web.message.user',
  inboxMessages: 'gist.web.inbox.messages',

  previewBarStep: 'gist.web.previewBarStep',
  previewBarCollapsed: 'gist.previewBar.collapsed',
};

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

interface StoredItem {
  value: unknown;
  expiry: Date | string;
}

export function shouldPersistSession(persisted: boolean | string): void {
  sessionStorage.setItem(STORAGE_KEYS.isPersistingSession, String(persisted));
}

export function setKeyToLocalStore(
  key: StorageKey | string,
  value: unknown,
  ttl: Date | null = null
): void {
  let expiryDate = ttl;
  if (!expiryDate) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + maxExpiryDays);
  }
  const item: StoredItem = {
    value,
    expiry: expiryDate,
  };
  getStorage().setItem(key, JSON.stringify(item));
}

export function getKeyFromLocalStore(key: StorageKey | string): unknown | null {
  return checkKeyForExpiry(key);
}

export function clearKeyFromLocalStore(key: StorageKey | string): void {
  getStorage().removeItem(key);
}

export function clearExpiredFromLocalStore(): void {
  const storage = getStorage();
  for (let i = storage.length - 1; i >= 0; i--) {
    const key = storage.key(i);
    if (isGistKey(key)) {
      checkKeyForExpiry(key);
    }
  }
}

export function clearSessionPersistenceFlag(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.isPersistingSession);
  } catch {
    /* ignore */
  }
}

export function isSessionBeingPersisted(): boolean {
  const currentValue = sessionStorage.getItem(STORAGE_KEYS.isPersistingSession);
  if (currentValue === null) {
    sessionStorage.setItem(STORAGE_KEYS.isPersistingSession, 'true');
    return true;
  }
  return currentValue === 'true';
}

function getStorage(): Storage {
  return isSessionBeingPersisted() ? localStorage : sessionStorage;
}

function checkKeyForExpiry(key: string | null): unknown | null {
  if (!key) return null;

  try {
    const itemStr = getStorage().getItem(key);
    if (!itemStr) return null;

    const item = JSON.parse(itemStr) as StoredItem;
    if (!item.expiry) return item.value;

    if (isGistKey(key)) {
      const now = new Date();
      const expiryTime = new Date(item.expiry);

      const isBroadcastOrUserKey =
        (key.startsWith('gist.web.message.broadcasts') &&
          !key.endsWith('shouldShow') &&
          !key.endsWith('numberOfTimesShown')) ||
        (key.startsWith('gist.web.message.user') &&
          !key.endsWith('seen') &&
          !key.endsWith('state'));
      const sixtyMinutesFromNow = new Date(now.getTime() + 61 * 60 * 1000);
      if (isBroadcastOrUserKey && expiryTime.getTime() > sixtyMinutesFromNow.getTime()) {
        clearKeyFromLocalStore(key);
        return null;
      }

      if (now.getTime() > expiryTime.getTime()) {
        clearKeyFromLocalStore(key);
        return null;
      }
    }

    return item.value;
  } catch (e) {
    log(`Error checking key ${key} for expiry: ${e}`);
  }

  return null;
}

function isGistKey(key: string | null): boolean {
  return key?.startsWith('gist.') ?? false;
}
