import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NetworkResponse } from '../services/network';

const mockDispatch = vi.fn();
let currentUserToken: string | null = 'user-1';

vi.mock('../gist', () => ({ default: { events: { dispatch: mockDispatch } } }));
vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('./user-manager', () => ({ getUserToken: vi.fn(() => currentUserToken) }));

type UserJwtManager = typeof import('./user-jwt-manager');
let jwt: UserJwtManager;

const EXPIRED = { error: 'user_jwt_rejected', reason: 'expired' };

function rejection(data: unknown): NetworkResponse {
  return { status: 401, headers: {}, data } as NetworkResponse;
}

// Rejects the request a tab sends now, with its current user token and JWT.
function rejectCurrent(data: unknown = EXPIRED): boolean {
  return jwt.handleUserJwtRejection(rejection(data), jwt.getRequestIdentity());
}

describe('user-jwt-manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    currentUserToken = 'user-1';
    localStorage.clear();
    sessionStorage.clear();
    jwt = await import('./user-jwt-manager');
  });

  describe('setUserJwt', () => {
    it('keeps the JWT in memory only and asks for a queue fetch', () => {
      jwt.setUserJwt('jwt-a');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(jwt.isQueueFetchRequested()).toBe(true);
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });

    it('clears the JWT for null, an empty string or whitespace', () => {
      for (const value of [null, '', '   ']) {
        jwt.setUserJwt('jwt-a');
        jwt.setUserJwt(value);
        expect(jwt.getUserJwt()).toBeNull();
      }
    });

    it('trims whitespace, which a request header cannot carry', () => {
      jwt.setUserJwt(' jwt-a\n');

      expect(jwt.getUserJwt()).toBe('jwt-a');
    });

    it('works before anything else has run', () => {
      expect(() => jwt.setUserJwt('jwt-a')).not.toThrow();
    });
  });

  describe('handleUserJwtRejection', () => {
    it('ignores anything but a 401', () => {
      jwt.setUserJwt('jwt-a');
      const response = { status: 500, headers: {}, data: {} } as NetworkResponse;

      expect(jwt.handleUserJwtRejection(response, jwt.getRequestIdentity())).toBe(false);
      expect(jwt.handleUserJwtRejection(undefined, jwt.getRequestIdentity())).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("pauses the queue and dispatches userJwtRejected with Gist's reason", () => {
      jwt.setUserJwt('jwt-a');

      expect(rejectCurrent()).toBe(true);

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', { reason: 'expired' });
    });

    it('leaves the reason out when the 401 has no body', () => {
      jwt.setUserJwt('jwt-a');

      jwt.handleUserJwtRejection(rejection(undefined), jwt.getRequestIdentity());

      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', {});
      expect(mockDispatch.mock.calls[0][1]).not.toHaveProperty('reason');
    });

    it('counts a 401 whatever its body holds', () => {
      jwt.setUserJwt('jwt-a');

      expect(rejectCurrent('<html>Unauthorized</html>')).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', {});
    });

    it('dispatches once per JWT value until a new value is set', () => {
      jwt.setUserJwt('jwt-a');
      rejectCurrent();
      jwt.setUserJwt('jwt-a');
      rejectCurrent();
      rejectCurrent();

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);

      jwt.setUserJwt('jwt-b');
      rejectCurrent({ reason: 'bad_signature' });

      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenLastCalledWith('userJwtRejected', {
        reason: 'bad_signature',
      });
    });

    it('gives no JWT at all one event too', () => {
      rejectCurrent({ reason: 'missing' });
      rejectCurrent({ reason: 'missing' });

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', { reason: 'missing' });
    });

    it('ignores the answer to a JWT this tab has since replaced', () => {
      jwt.setUserJwt('jwt-a');
      const sentWith = jwt.getRequestIdentity();
      jwt.setUserJwt('jwt-b');

      expect(jwt.handleUserJwtRejection(rejection(EXPIRED), sentWith)).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('ignores the answer to a user this tab has since left', () => {
      jwt.setUserJwt('jwt-a');
      const sentWith = jwt.getRequestIdentity();
      currentUserToken = 'user-2';

      expect(jwt.handleUserJwtRejection(rejection(EXPIRED), sentWith)).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('lets a listener that hands over a new JWT lift the pause', () => {
      jwt.setUserJwt('jwt-a');
      mockDispatch.mockImplementationOnce(() => jwt.setUserJwt('jwt-b'));

      rejectCurrent();

      expect(jwt.getUserJwt()).toBe('jwt-b');
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(jwt.isQueueFetchRequested()).toBe(true);
    });
  });

  describe('the fetch setUserJwt asks for, after a rejection', () => {
    it('is never held without a rejection', () => {
      jwt.setUserJwt('jwt-a');
      jwt.markQueueFetchSent(0);
      jwt.setUserJwt('jwt-b');

      expect(jwt.isRequestedQueueFetchHeld(10, 1)).toBe(false);
    });

    it('goes straight away the first time, then once per polling interval', () => {
      jwt.setUserJwt('jwt-a');
      jwt.markQueueFetchSent(0);
      rejectCurrent();

      jwt.setUserJwt('jwt-b');
      expect(jwt.isRequestedQueueFetchHeld(10, 500)).toBe(false);
      jwt.markQueueFetchSent(1_000);
      rejectCurrent();

      jwt.setUserJwt('jwt-c');
      expect(jwt.isRequestedQueueFetchHeld(10, 1_500)).toBe(true);
      expect(jwt.isRequestedQueueFetchHeld(10, 10_999)).toBe(true);
      expect(jwt.isRequestedQueueFetchHeld(10, 11_000)).toBe(false);
    });

    it('is free again once a queue fetch succeeds', () => {
      jwt.setUserJwt('jwt-a');
      rejectCurrent();
      jwt.setUserJwt('jwt-b');
      jwt.markQueueFetchSent(1_000);
      jwt.markQueueFetchSucceeded();

      jwt.setUserJwt('jwt-c');

      expect(jwt.isRequestedQueueFetchHeld(10, 2_000)).toBe(false);
    });

    it('is consumed by the fetch that carries it', () => {
      jwt.setUserJwt('jwt-a');
      jwt.markQueueFetchSent(0);

      expect(jwt.isQueueFetchRequested()).toBe(false);
    });
  });

  describe('applyUserTokenChange', () => {
    function rejectAndPause(): void {
      jwt.setUserJwt('jwt-a');
      jwt.markQueueFetchSent(0);
      rejectCurrent();
      jwt.setUserJwt('jwt-a');
      jwt.markQueueFetchSent(1_000);
      rejectCurrent();
      mockDispatch.mockClear();
    }

    it('setting the token already held keeps the JWT, the pause and the count', () => {
      rejectAndPause();

      jwt.applyUserTokenChange('unchanged');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      rejectCurrent();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('switching to another identified user drops the JWT, lifts the pause and starts the count over', () => {
      rejectAndPause();

      jwt.applyUserTokenChange('switched');

      expect(jwt.getUserJwt()).toBeNull();
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      jwt.setUserJwt('jwt-a');
      expect(jwt.isRequestedQueueFetchHeld(10, 1_500)).toBe(false);
      rejectCurrent();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('signing in from no token or the guest token keeps the JWT, lifts the pause and starts the count over', () => {
      rejectAndPause();

      jwt.applyUserTokenChange('signedIn');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      rejectCurrent();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('signing out drops the JWT, lifts the pause and starts the count over', () => {
      rejectAndPause();

      jwt.applyUserTokenChange('cleared');

      expect(jwt.getUserJwt()).toBeNull();
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      jwt.setUserJwt('jwt-a');
      rejectCurrent();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });
  });
});
