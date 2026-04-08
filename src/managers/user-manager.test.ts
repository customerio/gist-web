import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import {
  setUserToken,
  getUserToken,
  clearUserToken,
  useGuestSession,
  isUsingGuestUserToken,
  getEncodedUserToken,
  getHashedUserToken,
} from './user-manager';
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
} from '../utilities/local-storage';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/local-storage', () => ({
  setKeyToLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
  clearKeyFromLocalStore: vi.fn(),
  STORAGE_KEYS: {
    userToken: 'gist.web.userToken',
    usingGuestUserToken: 'gist.web.usingGuestUserToken',
    guestUserToken: 'gist.web.guestUserToken',
    userQueueNextPullCheck: 'gist.web.userQueueNextPullCheck',
  },
}));
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        ...globalThis.crypto,
        subtle: {
          digest: vi.fn(async (_algo: string, data: Uint8Array) => {
            return new Uint8Array(data.length).buffer;
          }),
        },
      },
      configurable: true,
    });
  }
});

describe('user-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getKeyFromLocalStore).mockReturnValue(null);
  });

  it('setUserToken stores token with expiry date', () => {
    const expiryDate = new Date('2025-12-31');
    setUserToken('my-token', expiryDate);
    expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.userToken', 'my-token', expiryDate);
  });

  it('setUserToken with no expiry defaults to 30 days', () => {
    const before = new Date();
    setUserToken('my-token');
    const after = new Date();
    expect(setKeyToLocalStore).toHaveBeenCalledWith(
      'gist.web.userToken',
      'my-token',
      expect.any(Date)
    );
    const [, , expiryDate] = vi.mocked(setKeyToLocalStore).mock.calls[0];
    const expiry = expiryDate as Date;
    const expectedMin = new Date(before);
    expectedMin.setDate(expectedMin.getDate() + 29);
    const expectedMax = new Date(after);
    expectedMax.setDate(expectedMax.getDate() + 31);
    expect(expiry.getTime()).toBeGreaterThanOrEqual(expectedMin.getTime());
    expect(expiry.getTime()).toBeLessThanOrEqual(expectedMax.getTime());
  });

  it('getUserToken returns stored token', () => {
    vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) =>
      key === 'gist.web.userToken' ? 'stored-token' : null
    );
    expect(getUserToken()).toBe('stored-token');
  });

  it('getUserToken returns null when no token set', () => {
    expect(getUserToken()).toBe(null);
  });

  it('clearUserToken removes the token', () => {
    clearUserToken();
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith('gist.web.userToken');
  });

  it('useGuestSession creates a guest UUID token when no token exists', () => {
    useGuestSession();
    expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.guestUserToken', 'mock-uuid-1234');
    expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.userToken', 'mock-uuid-1234');
    expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.usingGuestUserToken', true);
  });

  it('useGuestSession does not override existing tokens', () => {
    vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) =>
      key === 'gist.web.userToken' ? 'existing-token' : null
    );
    useGuestSession();
    expect(setKeyToLocalStore).not.toHaveBeenCalled();
  });

  it('isUsingGuestUserToken returns true after guest session', () => {
    vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) =>
      key === 'gist.web.usingGuestUserToken' ? true : null
    );
    expect(isUsingGuestUserToken()).toBe(true);
  });

  it('getEncodedUserToken returns base64-encoded token', () => {
    vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) =>
      key === 'gist.web.userToken' ? 'my-token' : null
    );
    expect(getEncodedUserToken()).toBe(btoa('my-token'));
  });

  it('getEncodedUserToken returns null when no token', () => {
    expect(getEncodedUserToken()).toBe(null);
  });

  it('getHashedUserToken returns null when no token', async () => {
    expect(await getHashedUserToken()).toBe(null);
  });

  it('getHashedUserToken returns SHA-256 hex hash when token exists', async () => {
    vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) =>
      key === 'gist.web.userToken' ? 'my-token' : null
    );
    const hash = await getHashedUserToken();
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hash).not.toBe(null);
  });
});
