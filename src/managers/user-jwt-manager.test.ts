import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NetworkResponse } from '../services/network';
import { setKeyToLocalStore, shouldPersistSession } from '../utilities/local-storage';

const mockDispatch = vi.fn();
let currentUserToken: string | null = 'user-1';
let currentIsGuest = false;

vi.mock('../gist', () => ({ default: { events: { dispatch: mockDispatch } } }));
vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('./user-manager', () => ({
  getUserToken: vi.fn(() => currentUserToken),
  isUsingGuestUserToken: vi.fn(() => currentIsGuest),
}));

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

const USER_JWT_KEY = 'gist.web.userJwt';

function storedUserJwt(): unknown {
  const item = localStorage.getItem(USER_JWT_KEY);
  return item === null ? null : (JSON.parse(item) as { value: unknown }).value;
}

// Stores a JWT the way setUserJwt in another tab does.
function storeAsAnotherTab(jwtValue: string, userToken: string | null): void {
  setKeyToLocalStore(USER_JWT_KEY, { jwt: jwtValue, userToken });
}

// Another tab: a fresh copy of the module, sharing this tab's storage and user token.
async function openAnotherTab(): Promise<UserJwtManager> {
  vi.resetModules();
  return import('./user-jwt-manager');
}

describe('user-jwt-manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    currentUserToken = 'user-1';
    currentIsGuest = false;
    localStorage.clear();
    sessionStorage.clear();
    jwt = await import('./user-jwt-manager');
  });

  describe('setUserJwt', () => {
    it('stores the JWT with the user token it was handed over for, and asks for a queue fetch', () => {
      jwt.setUserJwt('jwt-a');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(jwt.isQueueFetchRequested()).toBe(true);
      expect(storedUserJwt()).toEqual({ jwt: 'jwt-a', userToken: 'user-1' });
    });

    it('clears the JWT for null, an empty string or whitespace', () => {
      for (const value of [null, '', '   ']) {
        jwt.setUserJwt('jwt-a');
        jwt.setUserJwt(value);
        expect(jwt.getUserJwt()).toBeNull();
        expect(storedUserJwt()).toBeNull();
      }
    });

    it('keeps the JWT in sessionStorage when the session is not persisted', () => {
      shouldPersistSession(false);

      jwt.setUserJwt('jwt-a');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(sessionStorage.getItem(USER_JWT_KEY)).not.toBeNull();
      expect(localStorage.getItem(USER_JWT_KEY)).toBeNull();
    });

    it('trims whitespace, which a request header cannot carry', () => {
      jwt.setUserJwt(' jwt-a\n');

      expect(jwt.getUserJwt()).toBe('jwt-a');
    });

    it('works before anything else has run', () => {
      expect(() => jwt.setUserJwt('jwt-a')).not.toThrow();
    });

    it('asks for no fetch when given the JWT it already holds, unless a rejection paused the queue', () => {
      jwt.setUserJwt(null);
      expect(jwt.isQueueFetchRequested()).toBe(false);

      jwt.setUserJwt('jwt-a');
      jwt.markQueueFetchSent(0);
      jwt.setUserJwt(' jwt-a ');
      expect(jwt.isQueueFetchRequested()).toBe(false);

      rejectCurrent();
      jwt.setUserJwt('jwt-a');
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(jwt.isQueueFetchRequested()).toBe(true);
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
      expect(storedUserJwt()).toBeNull();
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      jwt.setUserJwt('jwt-a');
      expect(jwt.isRequestedQueueFetchHeld(10, 1_500)).toBe(false);
      rejectCurrent();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('signing in from no token keeps a JWT handed over before it, also through a guest session', () => {
      currentUserToken = null;
      jwt.setUserJwt('jwt-a');
      currentUserToken = 'guest-1';
      currentIsGuest = true;
      jwt.noteUserTokenAtStartup();
      currentUserToken = 'user-1';
      currentIsGuest = false;

      jwt.applyUserTokenChange('signedIn', 'guest-1');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(storedUserJwt()).toEqual({ jwt: 'jwt-a', userToken: 'user-1' });
    });

    it('signing in from the guest token keeps the JWT for the new user, lifts the pause and starts the count over', () => {
      currentUserToken = 'guest-1';
      currentIsGuest = true;
      rejectAndPause();
      currentUserToken = 'user-1';
      currentIsGuest = false;

      jwt.applyUserTokenChange('signedIn', 'guest-1');

      expect(jwt.getUserJwt()).toBe('jwt-a');
      expect(storedUserJwt()).toEqual({ jwt: 'jwt-a', userToken: 'user-1' });
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      rejectCurrent();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('signing in drops a JWT stored for someone else', () => {
      currentUserToken = 'user-9';
      jwt.setUserJwt('jwt-a');
      currentUserToken = 'user-1';

      jwt.applyUserTokenChange('signedIn', null);

      expect(jwt.getUserJwt()).toBeNull();
      expect(storedUserJwt()).toBeNull();
    });

    it('signing out drops the JWT, lifts the pause and starts the count over', () => {
      rejectAndPause();

      jwt.applyUserTokenChange('cleared');

      expect(jwt.getUserJwt()).toBeNull();
      expect(storedUserJwt()).toBeNull();
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      jwt.setUserJwt('jwt-a');
      rejectCurrent();
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });
  });

  // Every tab shares the stored JWT and the user token; the pause is this tab's.
  describe('other tabs', () => {
    it('uses a JWT another tab stored for the current user', () => {
      storeAsAnotherTab('jwt-b', 'user-1');

      expect(jwt.getUserJwt()).toBe('jwt-b');
    });

    it('sends no JWT once another tab has switched to someone else', () => {
      jwt.setUserJwt('jwt-a');

      currentUserToken = 'user-2';

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'user-2', userJwt: null });
    });

    it('stays paused while storage holds the rejected JWT', () => {
      jwt.setUserJwt('jwt-a');
      rejectCurrent();

      storeAsAnotherTab('jwt-a', 'user-1');

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
    });

    it('lifts the pause when another tab stores a different JWT', () => {
      jwt.setUserJwt('jwt-a');
      rejectCurrent();

      storeAsAnotherTab('jwt-b', 'user-1');

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
    });

    it('lifts the pause when another tab switches to someone else', () => {
      jwt.setUserJwt('jwt-a');
      rejectCurrent();

      currentUserToken = 'user-2';

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
    });

    it('keeps a pause to the tab whose JWT was rejected', async () => {
      const otherTab = await openAnotherTab();
      jwt.setUserJwt('jwt-a');

      rejectCurrent();

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      expect(otherTab.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(otherTab.getUserJwt()).toBe('jwt-a');
    });

    it("ignores a JWT from a tab whose app hasn't seen another tab's switch of user", async () => {
      const otherTab = await openAnotherTab();
      jwt.setUserJwt('jwt-1');

      currentUserToken = 'user-2';
      otherTab.applyUserTokenChange('switched', 'user-1');
      otherTab.setUserJwt('jwt-2');
      jwt.setUserJwt('jwt-1');

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-2', userToken: 'user-2' });
      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'user-2', userJwt: 'jwt-2' });
    });

    // Data Pipelines JS passes on the user storage holds, so a stale tab's own
    // identify() sets the other tab's user here without its app knowing them.
    it("doesn't take a JWT after a setUserToken with the token storage already holds", () => {
      jwt.setUserJwt('jwt-1');
      currentUserToken = 'user-2';
      localStorage.removeItem(USER_JWT_KEY);

      jwt.applyUserTokenChange('unchanged');
      jwt.setUserJwt('jwt-1');

      expect(storedUserJwt()).toBeNull();
    });

    it('takes a JWT again after a reload', async () => {
      jwt.setUserJwt('jwt-1');
      currentUserToken = 'user-2';

      const reloaded = await openAnotherTab();
      reloaded.setUserJwt('jwt-2');

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-2', userToken: 'user-2' });
    });

    it('lets a page that was signed out take a JWT for the person another window signed in', () => {
      currentUserToken = null;
      jwt.noteUserTokenAtStartup();

      currentUserToken = 'user-1';
      jwt.setUserJwt('jwt-1');

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-1', userToken: 'user-1' });
    });

    it('lets a guest page take a JWT for the person another tab signed in', () => {
      currentUserToken = 'guest-1';
      currentIsGuest = true;
      jwt.noteUserTokenAtStartup();

      currentUserToken = 'user-1';
      currentIsGuest = false;
      jwt.setUserJwt('jwt-1');

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-1', userToken: 'user-1' });
    });

    it('treats a preview session as signed out, so the page takes a JWT once the preview ends', async () => {
      const Gist = (await import('../gist')).default as unknown as {
        config?: { isPreviewSession?: boolean };
      };
      try {
        // setupPreview() sets the preview token before setup marks the page as a preview.
        currentUserToken = 'preview-session-1';
        jwt.applyUserTokenChange('signedIn', null);
        Gist.config = { isPreviewSession: true };

        // The session ends with the tab kept open: storage holds the visitor's token again.
        currentUserToken = 'user-1';
        jwt.setUserJwt('jwt-1');

        expect(storedUserJwt()).toEqual({ jwt: 'jwt-1', userToken: 'user-1' });
      } finally {
        // The mocked Gist outlives vi.resetModules(), so later tests mustn't see a preview.
        delete Gist.config;
      }
    });

    it("leaves another tab's JWT alone when a signed-out page hands over null", () => {
      currentUserToken = 'guest-1';
      currentIsGuest = true;
      jwt.noteUserTokenAtStartup();
      currentUserToken = 'user-1';
      currentIsGuest = false;
      storeAsAnotherTab('jwt-1', 'user-1');

      jwt.setUserJwt(null);
      jwt.setUserJwt(null);

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-1', userToken: 'user-1' });
    });

    it("doesn't let a signed-out page that already handed over a JWT adopt another tab's user", () => {
      currentUserToken = 'guest-1';
      currentIsGuest = true;
      jwt.noteUserTokenAtStartup();
      jwt.setUserJwt('jwt-kept-from-before');

      currentUserToken = 'user-2';
      currentIsGuest = false;
      jwt.setUserJwt('jwt-kept-from-before');

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-kept-from-before', userToken: 'guest-1' });
      expect(jwt.getUserJwt()).toBeNull();
    });

    it('keeps the user a setUserJwt before setup recorded, though another tab switched before setup', () => {
      jwt.setUserJwt('jwt-1');
      currentUserToken = 'user-2';

      jwt.noteUserTokenAtStartup();
      jwt.setUserJwt('jwt-1b');

      expect(storedUserJwt()).toEqual({ jwt: 'jwt-1', userToken: 'user-1' });
    });

    it("pauses a stale tab on a rejection without asking its app, which couldn't answer", () => {
      jwt.setUserJwt('jwt-1');
      currentUserToken = 'user-2';
      storeAsAnotherTab('jwt-2', 'user-2');

      expect(rejectCurrent()).toBe(true);

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('ignores the answer to a JWT another tab replaced while the request was out', () => {
      jwt.setUserJwt('jwt-a');
      const sentWith = jwt.getRequestIdentity();
      storeAsAnotherTab('jwt-b', 'user-1');

      expect(jwt.handleUserJwtRejection(rejection(EXPIRED), sentWith)).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
});
