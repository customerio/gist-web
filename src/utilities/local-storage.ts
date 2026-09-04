import { log } from './log';

const maxExpiryDays = 365;
const isPersistingSessionLocalStoreName = 'gist.web.isPersistingSession';

interface StoredItem {
  value: unknown;
  expiry: Date | string;
}

// A page can deny storage outright — private modes, blocked site data, an
// embedded browsing context — and in some browsers the access itself throws
// rather than returning null. Embedded messages run on arbitrary third-party
// pages where that is far likelier than inside a first-party app, and losing
// storage must never stop a message from rendering, so every access degrades
// to this in-memory store: frequency state stops surviving the page, and
// nothing else changes.
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length(): number {
      return entries.size;
    },
    clear: (): void => {
      entries.clear();
    },
    getItem: (key: string): string | null => entries.get(key) ?? null,
    key: (index: number): string | null => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string): void => {
      entries.delete(key);
    },
    setItem: (key: string, value: string): void => {
      entries.set(key, value);
    },
  } as Storage;
}

const memoryStorage = createMemoryStorage();
const storageProbeKey = '__gist.web.storageProbe';

// Probed with a real write: some browsers expose the object and only throw on
// use, and a zero-quota store reads back as if it worked.
function probe(resolve: () => Storage): Storage {
  try {
    const storage = resolve();
    storage.setItem(storageProbeKey, '1');
    storage.removeItem(storageProbeKey);
    return storage;
  } catch {
    log('Storage is unavailable on this page, falling back to in-memory storage.');
    return memoryStorage;
  }
}

let resolvedLocalStorage: Storage | undefined;
let resolvedSessionStorage: Storage | undefined;

function localStore(): Storage {
  resolvedLocalStorage ??= probe(() => localStorage);
  return resolvedLocalStorage;
}

function sessionStore(): Storage {
  resolvedSessionStorage ??= probe(() => sessionStorage);
  return resolvedSessionStorage;
}

export function shouldPersistSession(persisted: boolean | string): void {
  sessionStore().setItem(isPersistingSessionLocalStoreName, String(persisted));
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
  try {
    getStorage().setItem(key, JSON.stringify(item));
  } catch (e) {
    // Quota exhausted or a store that only fails on write. Losing the write is
    // always preferable to breaking the caller's flow.
    log(`Error writing key ${key} to storage: ${e}`);
  }
}

/**
 * Session-scoped storage, independent of the local/session switch getStorage()
 * makes for preview sessions. Used for per-tab embed frequency state, which has
 * to expire with the tab rather than on a clock.
 */
export function setKeyToSessionStore(key: string, value: string): void {
  try {
    sessionStore().setItem(key, value);
  } catch (e) {
    log(`Error writing key ${key} to session storage: ${e}`);
  }
}

export function getKeyFromSessionStore(key: string): string | null {
  try {
    return sessionStore().getItem(key);
  } catch {
    return null;
  }
}

export function clearKeyFromSessionStore(key: string): void {
  try {
    sessionStore().removeItem(key);
  } catch {
    /* ignore */
  }
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
    const key = storage.key(i);
    if (key?.startsWith('gist.')) {
      checkKeyForExpiry(key);
    }
  }
}

export function clearSessionPersistenceFlag(): void {
  try {
    sessionStore().removeItem(isPersistingSessionLocalStoreName);
  } catch {
    /* ignore */
  }
}

export function isSessionBeingPersisted(): boolean {
  const storage = sessionStore();
  const currentValue = storage.getItem(isPersistingSessionLocalStoreName);
  if (currentValue === null) {
    storage.setItem(isPersistingSessionLocalStoreName, 'true');
    return true;
  }
  return currentValue === 'true';
}

function getStorage(): Storage {
  return isSessionBeingPersisted() ? localStore() : sessionStore();
}

function checkKeyForExpiry(key: string | null): unknown | null {
  if (!key) return null;

  try {
    const itemStr = getStorage().getItem(key);
    if (!itemStr) return null;

    const item = JSON.parse(itemStr) as StoredItem;
    if (!item.expiry) return item.value;

    if (key.startsWith('gist.')) {
      const now = new Date();
      const expiryTime = new Date(item.expiry);

      const isBroadcastOrUserKey =
        (key.startsWith('gist.web.message.broadcasts') &&
          !key.endsWith('shouldShow') &&
          !key.endsWith('numberOfTimesShown')) ||
        (key.startsWith('gist.web.message.user') &&
          !key.endsWith('seen') &&
          !key.endsWith('state') &&
          !key.endsWith('snoozed'));
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
