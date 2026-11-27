import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserQueue,
  getQueueSSEEndpoint,
  getPollingIntervalSeconds,
  userQueueNextPullCheckLocalStoreName,
} from './queue-service';
import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
  shouldPersistSession,
} from '../utilities/local-storage';
import { getEncodedUserToken, getUserToken, getUserJwt } from '../managers/user-manager';
import { processInboxConfig } from '../managers/inbox-config-manager';
import Gist from '../gist';
import {
  applyUserTokenChange,
  isQueueFetchRequested,
  isQueuePausedByUserJwtRejection,
  markQueueFetchSent,
  setUserJwt,
} from '../managers/user-jwt-manager';

const mockPost = vi.fn();

vi.mock('../gist', () => ({
  default: {
    config: {
      env: 'prod',
      siteId: 'test-site-id',
    },
  },
}));

vi.mock('./network', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./network')>();
  return {
    ...actual,
    UserNetworkInstance: vi.fn(() => ({
      post: mockPost,
    })),
  };
});

vi.mock('../utilities/log', () => ({ log: vi.fn() }));

const storedUserJwt = vi.hoisted(() => ({ value: null as string | null }));
vi.mock('../managers/user-manager', () => ({
  isUsingGuestUserToken: vi.fn(() => false),
  getEncodedUserToken: vi.fn(() => null),
  getUserToken: vi.fn(() => null),
  getUserJwt: vi.fn(() => storedUserJwt.value),
  storeUserJwt: vi.fn((jwt: string) => {
    storedUserJwt.value = jwt;
  }),
  clearUserJwt: vi.fn(() => {
    storedUserJwt.value = null;
  }),
}));

vi.mock('../managers/locale-manager', () => ({
  getUserLocale: vi.fn(() => 'en-US'),
}));

vi.mock('../managers/inbox-config-manager', () => ({
  processInboxConfig: vi.fn(() => Promise.resolve()),
}));

vi.mock('./settings', () => ({
  settings: {
    GIST_QUEUE_REALTIME_API_ENDPOINT: {
      prod: 'https://realtime.cloud.gist.build',
      dev: 'https://realtime.cloud.dev.gist.build',
      local: 'http://api.local.gist.build:3000',
    },
    setUseSSEFlag: vi.fn(),
  },
}));

describe('queue-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldPersistSession(true);
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(getEncodedUserToken).mockReturnValue('encoded-token');
    vi.mocked(getUserToken).mockReturnValue('user-token');
  });

  it('getUserQueue() sends POST to correct endpoint with correct headers', async () => {
    mockPost.mockResolvedValue({
      status: 200,
      data: {},
      headers: {},
    });

    await getUserQueue();

    expect(mockPost).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/v4\/users\?sessionId=/),
      {},
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Gist-User-Anonymous': 'false',
          'Content-Language': 'en-US',
        }),
      })
    );
  });

  it('getUserQueue() returns error.response when POST fails', async () => {
    const errorResponse = { status: 500, data: 'Server error', headers: {} };
    mockPost.mockRejectedValue({ response: errorResponse });

    const result = await getUserQueue();

    expect(result).toEqual(errorResponse);
  });

  it('getUserQueue() skips if checkInProgress is true', async () => {
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: 200, data: {}, headers: {} }), 50);
        })
    );

    const promise1 = getUserQueue();
    const promise2 = getUserQueue();

    await promise1;
    await promise2;

    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('getUserQueue() clears next pull check if user token changed during request', async () => {
    mockPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          vi.mocked(getUserToken).mockReturnValue('different-token');
          resolve({
            status: 200,
            data: {},
            headers: {},
          });
        })
    );

    await getUserQueue();

    expect(getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName)).toBeNull();
  });

  it('getQueueSSEEndpoint() returns null when no user token', async () => {
    vi.mocked(getEncodedUserToken).mockReturnValue(null);

    const result = getQueueSSEEndpoint();

    expect(result).toBeNull();
  });

  it('getQueueSSEEndpoint() returns correct URL with encoded token and site ID', () => {
    vi.mocked(getEncodedUserToken).mockReturnValue('encoded-token-123');
    setKeyToLocalStore('gist.web.sessionId', 'session-456', new Date(Date.now() + 1800000));

    const result = getQueueSSEEndpoint();

    expect(result).toContain('https://realtime.cloud.gist.build/api/v3/sse');
    expect(result).toContain('userToken=encoded-token-123');
    expect(result).toContain('siteId=test-site-id');
    expect(result).toContain('sessionId=session-456');
    expect(result).toContain('platform=web');
  });

  it('getUserQueue() calls processInboxConfig with the response', async () => {
    const responseData = {
      status: 200,
      data: {},
      headers: { 'x-cio-inbox-enabled': 'true' },
    };
    mockPost.mockResolvedValue(responseData);

    await getUserQueue();

    expect(processInboxConfig).toHaveBeenCalledWith(responseData);
  });

  it('scheduleNextQueuePull sets the correct TTL based on response header', async () => {
    mockPost.mockResolvedValue({
      status: 200,
      data: {},
      headers: {
        'x-gist-queue-polling-interval': '120',
      },
    });

    await getUserQueue();

    const storedValue = getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    expect(Number(storedValue)).toBe(120);
  });

  describe('user JWT rejections', () => {
    const dispatch = vi.fn();
    const rejection = {
      status: 401,
      data: { error: 'user_jwt_rejected', reason: 'expired' },
      headers: {},
    };

    beforeEach(() => {
      (Gist as unknown as { events?: unknown }).events = { dispatch };
      applyUserTokenChange();
      markQueueFetchSent();
    });

    afterEach(() => {
      delete (Gist as unknown as { events?: unknown }).events;
    });

    it('a rejection pauses this tab and leaves the shared schedule and polling interval alone', async () => {
      mockPost.mockResolvedValueOnce({
        status: 200,
        data: {},
        headers: { 'x-gist-queue-polling-interval': '30' },
      });
      await getUserQueue();
      const schedule = localStorage.getItem(userQueueNextPullCheckLocalStoreName);
      expect(schedule).not.toBeNull();
      setUserJwt('jwt-a');
      mockPost.mockRejectedValueOnce({ response: rejection });

      const result = await getUserQueue();

      expect(result?.status).toBe(401);
      expect(localStorage.getItem(userQueueNextPullCheckLocalStoreName)).toBe(schedule);
      expect(getPollingIntervalSeconds()).toBe(30);
      expect(isQueuePausedByUserJwtRejection()).toBe(true);
      expect(dispatch).toHaveBeenCalledWith('userJwtRejected', { reason: 'expired' });
    });

    it('discards a rejection of a JWT replaced while the fetch was in flight', async () => {
      setUserJwt('jwt-a');
      mockPost.mockImplementationOnce(() => {
        setUserJwt('jwt-b');
        return Promise.reject({ response: rejection });
      });

      const result = await getUserQueue();

      expect(result).toBeUndefined();
      expect(dispatch).not.toHaveBeenCalled();
      expect(isQueuePausedByUserJwtRejection()).toBe(false);
      expect(getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName)).toBeNull();

      let sentJwt: string | null = null;
      mockPost.mockImplementationOnce(() => {
        sentJwt = getUserJwt();
        return Promise.resolve({ status: 200, data: {}, headers: {} });
      });
      await getUserQueue();

      expect(sentJwt).toBe('jwt-b');
    });

    it('keeps a successful answer to a JWT replaced for the same user while the fetch was in flight', async () => {
      setUserJwt('jwt-a');
      const answer = {
        status: 200,
        data: { inAppMessages: [{ queueId: 'queue-1' }] },
        headers: { 'x-gist-queue-polling-interval': '30', 'x-cio-use-sse': 'False' },
      };
      mockPost.mockImplementationOnce(() => {
        setUserJwt('jwt-b');
        return Promise.resolve(answer);
      });

      const result = await getUserQueue();

      expect(result).toBe(answer);
      expect(Number(getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName))).toBe(30);
      expect(processInboxConfig).toHaveBeenCalledWith(answer);
      expect(dispatch).not.toHaveBeenCalled();
      // The fetch the new JWT asked for still goes.
      expect(isQueueFetchRequested()).toBe(true);
    });
  });
});
