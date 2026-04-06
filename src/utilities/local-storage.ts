import { log } from './log';

const maxExpiryDays = 365;
const isPersistingSessionLocalStoreName = 'gist.web.isPersistingSession';

interface StoredItem {
  value: unknown;
  expiry: Date | string;
}

export function shouldPersistSession(persisted: boolean | string): void {
  sessionStorage.setItem(isPersistingSessionLocalStoreName, String(persisted));
}

export function setKeyToLocalStore(key: string, value: unknown, ttl: Date | null = null): void {
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

export function getKeyFromLocalStore(key: string): unknown | null {
  return checkKeyForExpiry(key);
}

export function clearKeyFromLocalStore(key: string): void {
  getStorage().removeItem(key);
}

export function clearExpiredFromLocalStore(): void {
  const storage = getStorage();
  for (let i = storage.length - 1; i >= 0; i--) {
    checkKeyForExpiry(storage.key(i));
  }
}

export function clearSessionPersistenceFlag(): void {
  try {
    sessionStorage.removeItem(isPersistingSessionLocalStoreName);
  } catch {
    /* ignore */
  }
}

export function isSessionBeingPersisted(): boolean {
  const currentValue = sessionStorage.getItem(isPersistingSessionLocalStoreName);
  if (currentValue === null) {
    sessionStorage.setItem(isPersistingSessionLocalStoreName, 'true');
    return true;
  }
  return currentValue === 'true';
}

function getStorage(): Storage {
  return isSessionBeingPersisted() ? localStorage : sessionStorage;
}

function checkKeyForExpiry(key: string | null): unknown | null {
  if (!key || !key.startsWith('gist.')) return null;

  try {
    const itemStr = getStorage().getItem(key);
    if (!itemStr) return null;

    const item = JSON.parse(itemStr) as StoredItem;
    if (!item.expiry) return item.value;

    const now = new Date();
    const expiryTime = new Date(item.expiry);

    const isBroadcastOrUserKey =
      (key.startsWith('gist.web.message.broadcasts') &&
        !key.endsWith('shouldShow') &&
        !key.endsWith('numberOfTimesShown')) ||
      (key.startsWith('gist.web.message.user') && !key.endsWith('seen') && !key.endsWith('state'));
    const sixtyMinutesFromNow = new Date(now.getTime() + 61 * 60 * 1000);
    if (isBroadcastOrUserKey && expiryTime.getTime() > sixtyMinutesFromNow.getTime()) {
      clearKeyFromLocalStore(key);
      return null;
    }

    if (now.getTime() > expiryTime.getTime()) {
      clearKeyFromLocalStore(key);
      return null;
    }

    return item.value;
  } catch (e) {
    log(`Error checking key ${key} for expiry: ${e}`);
  }

  return null;
}
