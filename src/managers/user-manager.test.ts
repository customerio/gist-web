import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import {
  setUserToken,
  getUserToken,
  clearUserToken,
  useGuestSession,
  isUsingGuestUserToken,
  getEncodedUserToken,
  getHashedUserToken,
  readUserJwtSubject,
  getUserJwt,
  storeUserJwt,
  isUserNamedByJwt,
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
}));
vi.mock('../services/queue-service', () => ({
  userQueueNextPullCheckLocalStoreName: 'gist.web.userQueueNextPullCheck',
}));
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid-1234'),
}));

function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// A JWT with this payload, encoded as a backend encodes one. Nothing checks the signature.
function jwtWith(payload: unknown): string {
  return `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify(payload))}.signature`;
}

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

  it('clearUserToken removes the token and the JWT', () => {
    clearUserToken();
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith('gist.web.userToken');
    expect(clearKeyFromLocalStore).toHaveBeenCalledWith('gist.web.userJwt');
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

  describe('setUserToken reports the change of user', () => {
    function holding(userToken: string | null, guest = false): void {
      vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => {
        if (key === 'gist.web.userToken') return userToken;
        if (key === 'gist.web.usingGuestUserToken') return guest ? true : null;
        return null;
      });
    }

    it('signs in when no token is held', () => {
      holding(null);
      expect(setUserToken('user-1')).toBe('signedIn');
    });

    it('signs in when the guest token is held', () => {
      holding('guest-uuid', true);
      expect(setUserToken('user-1')).toBe('signedIn');
    });

    it('changes nothing when the same identified token is held', () => {
      holding('user-1');
      expect(setUserToken('user-1')).toBe('unchanged');
    });

    it('switches when another identified token is held', () => {
      holding('user-1');
      expect(setUserToken('user-2')).toBe('switched');
    });
  });

  describe('readUserJwtSubject', () => {
    it('reads the sub from a base64url payload without padding', () => {
      const jwt = jwtWith({ sub: 'cio_ab12', name: '???~~~' });
      const payload = jwt.split('.')[1];
      expect(payload).toMatch(/-/);
      expect(payload).toMatch(/_/);
      expect(payload.length % 4).not.toBe(0);

      expect(readUserJwtSubject(jwt)).toBe('cio_ab12');
    });

    it('reads a sub outside ASCII as the backend wrote it', () => {
      expect(readUserJwtSubject(jwtWith({ sub: 'cio_ünïcødé' }))).toBe('cio_ünïcødé');
    });

    it.each([
      ['two parts', 'abc.def'],
      ['four parts', `${jwtWith({ sub: 'cio_1' })}.extra`],
      ['a payload that is not base64', 'header.%%%.signature'],
      ['a payload that is not JSON', `header.${base64url('not json')}.signature`],
      ['no sub', jwtWith({ exp: 1 })],
      ['a sub that is not a string', jwtWith({ sub: 42 })],
      ['an empty sub', jwtWith({ sub: '' })],
      ['a null payload', jwtWith(null)],
      ['a payload that is a string', jwtWith('cio_1')],
      ['a sub with a character above U+00FF', jwtWith({ sub: 'cio_\u2713' })],
    ])('returns null for a JWT with %s', (_case, jwt) => {
      expect(readUserJwtSubject(jwt)).toBeNull();
    });
  });

  describe('the stored JWT', () => {
    function holding(entries: Record<string, unknown>): void {
      vi.mocked(getKeyFromLocalStore).mockImplementation((key: string) => entries[key] ?? null);
    }

    it('makes the person it names the user, over the stored token', () => {
      holding({ 'gist.web.userToken': 'user-1', 'gist.web.userJwt': jwtWith({ sub: 'cio_a' }) });

      expect(isUserNamedByJwt()).toBe(true);
      expect(getUserToken()).toBe('cio_a');
      expect(getEncodedUserToken()).toBe(btoa('cio_a'));
    });

    it("sends the stored token, without failing, for a sub the user-token header can't carry", () => {
      holding({
        'gist.web.userToken': 'user-1',
        'gist.web.userJwt': jwtWith({ sub: 'cio_\u2713' }),
      });

      expect(getUserToken()).toBe('user-1');
      expect(getEncodedUserToken()).toBe(btoa('user-1'));
    });

    it('leaves the stored token as the user while it names nobody', () => {
      holding({ 'gist.web.userToken': 'user-1', 'gist.web.userJwt': 'opaque' });

      expect(isUserNamedByJwt()).toBe(false);
      expect(getUserToken()).toBe('user-1');
    });

    it('leaves room for a guest session, which waits under it', () => {
      holding({ 'gist.web.userJwt': jwtWith({ sub: 'cio_a' }) });

      useGuestSession();

      expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.userToken', 'mock-uuid-1234');
      expect(setKeyToLocalStore).toHaveBeenCalledWith('gist.web.usingGuestUserToken', true);
    });

    it('ends a guest session while it names someone', () => {
      holding({
        'gist.web.userToken': 'guest-uuid',
        'gist.web.usingGuestUserToken': true,
        'gist.web.userJwt': jwtWith({ sub: 'cio_a' }),
      });
      expect(isUsingGuestUserToken()).toBe(false);

      holding({
        'gist.web.userToken': 'guest-uuid',
        'gist.web.usingGuestUserToken': true,
        'gist.web.userJwt': 'opaque',
      });
      expect(isUsingGuestUserToken()).toBe(true);
    });

    it('is read back exactly as stored, and only as a non-empty string', () => {
      holding({ 'gist.web.userJwt': ' a.b.c ' });
      expect(getUserJwt()).toBe(' a.b.c ');

      holding({ 'gist.web.userJwt': 42 });
      expect(getUserJwt()).toBeNull();

      holding({ 'gist.web.userJwt': '' });
      expect(getUserJwt()).toBeNull();
    });

    it('is stored under its own key for as long as a user token is', () => {
      const before = new Date();
      storeUserJwt('a.b.c');

      const [key, value, expiryDate] = vi.mocked(setKeyToLocalStore).mock.calls[0];
      expect([key, value]).toEqual(['gist.web.userJwt', 'a.b.c']);
      const expected = new Date(before);
      expected.setDate(expected.getDate() + 30);
      expect(Math.abs((expiryDate as Date).getTime() - expected.getTime())).toBeLessThan(60_000);
    });

    it('leaves setUserToken reporting the change against the stored token', () => {
      holding({ 'gist.web.userToken': 'user-1', 'gist.web.userJwt': jwtWith({ sub: 'cio_a' }) });
      expect(setUserToken('user-1')).toBe('unchanged');

      holding({
        'gist.web.userToken': 'guest-uuid',
        'gist.web.usingGuestUserToken': true,
        'gist.web.userJwt': jwtWith({ sub: 'cio_a' }),
      });
      expect(setUserToken('user-1')).toBe('signedIn');
      expect(clearKeyFromLocalStore).toHaveBeenCalledWith('gist.web.usingGuestUserToken');
    });
  });
});
