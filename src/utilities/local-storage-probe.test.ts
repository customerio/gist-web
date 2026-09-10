import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./log', () => ({ log: vi.fn() }));

// Kept apart from local-storage.test.ts, which drives the real jsdom stores.
// These cases need a store that misbehaves in a specific way, and the module
// resolves each store once and remembers it, so every case gets a fresh copy
// of the module.

function mapStore(seed: Record<string, string> = {}): Storage {
  const entries = new Map(Object.entries(seed));
  return {
    get length(): number {
      return entries.size;
    },
    clear: (): void => entries.clear(),
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

/** Reads fine, refuses every write — an exhausted quota. */
function readOnlyStore(seed: Record<string, string> = {}): Storage {
  const store = mapStore(seed);
  return {
    ...store,
    get length(): number {
      return store.length;
    },
    getItem: (key: string) => store.getItem(key),
    key: (index: number) => store.key(index),
    removeItem: (key: string) => store.removeItem(key),
    setItem: (): void => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    },
  } as Storage;
}

/** Accepts writes and silently drops them, throwing nothing. */
function noopStore(seed: Record<string, string> = {}): Storage {
  const store = mapStore(seed);
  return {
    ...store,
    get length(): number {
      return store.length;
    },
    getItem: (key: string) => store.getItem(key),
    key: (index: number) => store.key(index),
    removeItem: (key: string) => store.removeItem(key),
    setItem: (): void => {},
  } as Storage;
}

/** Hands back an object that throws the moment it is read. */
function unreadableStore(): Storage {
  return {
    get length(): number {
      throw new DOMException('denied', 'SecurityError');
    },
    clear: (): void => {},
    getItem: (): string | null => {
      throw new DOMException('denied', 'SecurityError');
    },
    key: (): string | null => null,
    removeItem: (): void => {},
    setItem: (): void => {},
  } as Storage;
}

const originals = new Map<string, PropertyDescriptor | undefined>();

function install(name: 'localStorage' | 'sessionStorage', get: () => Storage): void {
  if (!originals.has(name)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  }
  Object.defineProperty(globalThis, name, { configurable: true, get });
}

async function freshModule(): Promise<typeof import('./local-storage')> {
  vi.resetModules();
  return import('./local-storage');
}

function storedItem(value: unknown): string {
  return JSON.stringify({ value, expiry: new Date(Date.now() + 60_000).toISOString() });
}

afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
    } else {
      delete (globalThis as Record<string, unknown>)[name];
    }
  }
  originals.clear();
});

describe('local-storage store resolution', () => {
  it('falls back to memory when the store cannot be accessed at all', async () => {
    const session = mapStore();
    install('sessionStorage', () => session);
    install('localStorage', () => {
      throw new DOMException('denied', 'SecurityError');
    });

    const store = await freshModule();
    store.shouldPersistSession(true);
    store.setKeyToLocalStore('gist.web.probe-test', { a: 1 });

    expect(store.getKeyFromLocalStore('gist.web.probe-test')).toEqual({ a: 1 });
  });

  it('keeps a store that refuses writes, so existing state stays readable', async () => {
    const session = mapStore();
    const local = readOnlyStore({ 'gist.web.probe-test': storedItem({ a: 1 }) });
    install('sessionStorage', () => session);
    install('localStorage', () => local);

    const store = await freshModule();
    store.shouldPersistSession(true);

    // The point of the case: a full quota must not cost the visitor access to
    // what they already had stored.
    expect(store.getKeyFromLocalStore('gist.web.probe-test')).toEqual({ a: 1 });

    // And a write that cannot land must not reach the caller.
    expect(() => store.setKeyToLocalStore('gist.web.other', { b: 2 })).not.toThrow();
    expect(store.getKeyFromLocalStore('gist.web.other')).toBeNull();
  });

  it('keeps a store whose writes are silently dropped, for the same reason', async () => {
    const session = mapStore();
    const local = noopStore({ 'gist.web.probe-test': storedItem({ a: 1 }) });
    install('sessionStorage', () => session);
    install('localStorage', () => local);

    const store = await freshModule();
    store.shouldPersistSession(true);

    // A write that vanishes without an exception is the same situation as one
    // that throws, so it gets the same answer: the store stays.
    expect(store.getKeyFromLocalStore('gist.web.probe-test')).toEqual({ a: 1 });
    expect(() => store.setKeyToLocalStore('gist.web.other', { b: 2 })).not.toThrow();
    expect(store.getKeyFromLocalStore('gist.web.other')).toBeNull();
  });

  it('falls back to memory when the store cannot be read', async () => {
    const session = mapStore();
    install('sessionStorage', () => session);
    install('localStorage', () => unreadableStore());

    const store = await freshModule();
    store.shouldPersistSession(true);
    store.setKeyToLocalStore('gist.web.probe-test', { a: 1 });

    expect(store.getKeyFromLocalStore('gist.web.probe-test')).toEqual({ a: 1 });
  });

  it('does not throw when the session store refuses the persistence flag', async () => {
    install('sessionStorage', () => readOnlyStore());
    install('localStorage', () => mapStore());

    const store = await freshModule();

    expect(() => store.shouldPersistSession(true)).not.toThrow();
    expect(() => store.isSessionBeingPersisted()).not.toThrow();
  });
});
