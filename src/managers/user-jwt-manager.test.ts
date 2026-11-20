import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NetworkResponse } from '../services/network';
import { setKeyToLocalStore, shouldPersistSession } from '../utilities/local-storage';

const mockDispatch = vi.fn();

vi.mock('../gist', () => ({ default: { events: { dispatch: mockDispatch } } }));
vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../services/queue-service', () => ({
  userQueueNextPullCheckLocalStoreName: 'gist.web.userQueueNextPullCheck',
}));

type UserJwtManager = typeof import('./user-jwt-manager');
let jwt: UserJwtManager;

const USER_JWT_KEY = 'gist.web.userJwt';
const USER_TOKEN_KEY = 'gist.web.userToken';
const EXPIRED = { error: 'user_jwt_rejected', reason: 'expired' };

let issued = 0;

// A new JWT naming `sub`, as a backend signs one at each sign-in or renewal.
function jwtFor(sub: string): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  issued += 1;
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ sub, n: issued })}.signature`;
}

function rejection(data: unknown): NetworkResponse {
  return { status: 401, headers: {}, data } as NetworkResponse;
}

// Rejects the request a tab sends now, with its current user token and JWT.
function rejectCurrent(data: unknown = EXPIRED, tab: UserJwtManager = jwt): boolean {
  return tab.handleUserJwtRejection(rejection(data), tab.getRequestIdentity());
}

function storedUserJwt(): unknown {
  const item = localStorage.getItem(USER_JWT_KEY);
  return item === null ? null : (JSON.parse(item) as { value: unknown }).value;
}

// What another tab, or an earlier page, leaves in storage.
function storeAsAnotherTab(jwtValue: string): void {
  setKeyToLocalStore(USER_JWT_KEY, jwtValue);
}

function holdUserToken(userToken: string): void {
  setKeyToLocalStore(USER_TOKEN_KEY, userToken);
}

// Another tab, or the page after a reload: a fresh copy of the module over the same storage.
async function openAnotherTab(): Promise<UserJwtManager> {
  vi.resetModules();
  return import('./user-jwt-manager');
}

describe('user-jwt-manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
    sessionStorage.clear();
    holdUserToken('user-1');
    jwt = await import('./user-jwt-manager');
  });

  describe('setUserJwt', () => {
    it('stores the JWT as handed over, makes the person it names the user and asks for a queue fetch', () => {
      const alice = jwtFor('cio_a');

      expect(jwt.setUserJwt(alice)).toBe(true);

      expect(storedUserJwt()).toBe(alice);
      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'cio_a', userJwt: alice });
      expect(jwt.isQueueFetchRequested()).toBe(true);
    });

    it('reports no change of user for a new JWT naming the same person', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      const renewed = jwtFor('cio_a');

      expect(jwt.setUserJwt(renewed)).toBe(false);

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'cio_a', userJwt: renewed });
    });

    it('reports a change of user for a JWT naming someone else', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      const bob = jwtFor('cio_b');

      expect(jwt.setUserJwt(bob)).toBe(true);

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'cio_b', userJwt: bob });
    });

    it('sends a JWT that names nobody with the token it finds, leaving the user as is', () => {
      expect(jwt.setUserJwt('not-a-jwt')).toBe(false);

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'user-1', userJwt: 'not-a-jwt' });
    });

    it('clears the JWT for null, an empty string or whitespace, which leaves the stored token the user', () => {
      for (const cleared of [null, '', '   ']) {
        jwt.setUserJwt(jwtFor('cio_a'));

        expect(jwt.setUserJwt(cleared)).toBe(true);

        expect(storedUserJwt()).toBeNull();
        expect(jwt.getRequestIdentity()).toEqual({ userToken: 'user-1', userJwt: null });
      }
    });

    it('keeps the JWT in sessionStorage when the session is not persisted', () => {
      shouldPersistSession(false);
      const alice = jwtFor('cio_a');

      jwt.setUserJwt(alice);

      expect(localStorage.getItem(USER_JWT_KEY)).toBeNull();
      expect(sessionStorage.getItem(USER_JWT_KEY)).toContain(alice);
    });

    it('trims whitespace, which a request header cannot carry', () => {
      const alice = jwtFor('cio_a');

      jwt.setUserJwt(`  ${alice}\n`);

      expect(storedUserJwt()).toBe(alice);
    });

    it('asks for no fetch when given the JWT already in use, unless a rejection paused the queue', () => {
      jwt.setUserJwt(null);
      expect(jwt.isQueueFetchRequested()).toBe(false);

      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      jwt.markQueueFetchSent(0);
      jwt.setUserJwt(` ${alice} `);
      expect(jwt.isQueueFetchRequested()).toBe(false);

      rejectCurrent();
      jwt.setUserJwt(alice);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(jwt.isQueueFetchRequested()).toBe(true);
    });
  });

  describe('handleUserJwtRejection', () => {
    it('ignores anything but a 401', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      const response = { status: 500, headers: {}, data: {} } as NetworkResponse;

      expect(jwt.handleUserJwtRejection(response, jwt.getRequestIdentity())).toBe(false);
      expect(jwt.handleUserJwtRejection(undefined, jwt.getRequestIdentity())).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it("pauses the queue and dispatches userJwtRejected with Gist's reason", () => {
      jwt.setUserJwt(jwtFor('cio_a'));

      expect(rejectCurrent()).toBe(true);

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', { reason: 'expired' });
    });

    it('leaves the reason out when the 401 has no body', () => {
      jwt.setUserJwt(jwtFor('cio_a'));

      jwt.handleUserJwtRejection(rejection(undefined), jwt.getRequestIdentity());

      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', {});
      expect(mockDispatch.mock.calls[0][1]).not.toHaveProperty('reason');
    });

    it('counts a 401 whatever its body holds', () => {
      jwt.setUserJwt(jwtFor('cio_a'));

      expect(rejectCurrent('<html>Unauthorized</html>')).toBe(true);
      expect(mockDispatch).toHaveBeenCalledWith('userJwtRejected', {});
    });

    it('dispatches once per JWT value until a new value is set', () => {
      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      rejectCurrent();
      jwt.setUserJwt(alice);
      rejectCurrent();
      rejectCurrent();

      expect(mockDispatch).toHaveBeenCalledTimes(1);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);

      jwt.setUserJwt(jwtFor('cio_a'));
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
      jwt.setUserJwt(jwtFor('cio_a'));
      const sentWith = jwt.getRequestIdentity();
      jwt.setUserJwt(jwtFor('cio_a'));

      expect(jwt.handleUserJwtRejection(rejection(EXPIRED), sentWith)).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('ignores the answer to a user this tab has since left', () => {
      const sentWith = jwt.getRequestIdentity();
      jwt.applyUserTokenChange('switched');
      holdUserToken('user-2');

      expect(jwt.handleUserJwtRejection(rejection(EXPIRED), sentWith)).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('lets a listener that hands over a new JWT lift the pause', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      const renewed = jwtFor('cio_a');
      mockDispatch.mockImplementationOnce(() => jwt.setUserJwt(renewed));

      rejectCurrent();

      expect(storedUserJwt()).toBe(renewed);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(jwt.isQueueFetchRequested()).toBe(true);
    });
  });

  describe('the fetch setUserJwt asks for, after a rejection', () => {
    it('is never held without a rejection', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      jwt.markQueueFetchSent(0);
      jwt.setUserJwt(jwtFor('cio_a'));

      expect(jwt.isRequestedQueueFetchHeld(10, 1)).toBe(false);
    });

    it('goes straight away the first time, then once per polling interval', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      jwt.markQueueFetchSent(0);
      rejectCurrent();

      jwt.setUserJwt(jwtFor('cio_a'));
      expect(jwt.isRequestedQueueFetchHeld(10, 500)).toBe(false);
      jwt.markQueueFetchSent(1_000);
      rejectCurrent();

      jwt.setUserJwt(jwtFor('cio_a'));
      expect(jwt.isRequestedQueueFetchHeld(10, 1_500)).toBe(true);
      expect(jwt.isRequestedQueueFetchHeld(10, 10_999)).toBe(true);
      expect(jwt.isRequestedQueueFetchHeld(10, 11_000)).toBe(false);
    });

    it('is free again once a queue fetch succeeds', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      rejectCurrent();
      jwt.setUserJwt(jwtFor('cio_a'));
      jwt.markQueueFetchSent(1_000);
      jwt.markQueueFetchSucceeded();

      jwt.setUserJwt(jwtFor('cio_a'));

      expect(jwt.isRequestedQueueFetchHeld(10, 2_000)).toBe(false);
    });

    it('is free again once a JWT names someone else', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      jwt.markQueueFetchSent(0);
      rejectCurrent();
      jwt.setUserJwt(jwtFor('cio_a'));
      jwt.markQueueFetchSent(1_000);
      rejectCurrent();
      mockDispatch.mockClear();

      jwt.setUserJwt(jwtFor('cio_b'));
      jwt.markQueueFetchSent(1_500);
      rejectCurrent();
      jwt.setUserJwt(jwtFor('cio_b'));

      expect(jwt.isRequestedQueueFetchHeld(10, 2_000)).toBe(false);
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('is consumed by the fetch that carries it', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      jwt.markQueueFetchSent(0);

      expect(jwt.isQueueFetchRequested()).toBe(false);
    });
  });

  describe('applyUserTokenChange', () => {
    function rejectTwice(jwtValue: string): void {
      jwt.setUserJwt(jwtValue);
      jwt.markQueueFetchSent(0);
      rejectCurrent();
      jwt.setUserJwt(jwtValue);
      jwt.markQueueFetchSent(1_000);
      rejectCurrent();
      mockDispatch.mockClear();
    }

    it('setting the token already held keeps the JWT, the pause and the count', () => {
      const opaque = 'opaque-jwt';
      rejectTwice(opaque);

      jwt.applyUserTokenChange('unchanged');

      expect(storedUserJwt()).toBe(opaque);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      rejectCurrent();
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it.each(['signedIn', 'switched', 'cleared'] as const)(
      '%s drops a JWT that names nobody, lifts the pause and starts the count over',
      (change) => {
        const opaque = 'opaque-jwt';
        rejectTwice(opaque);

        jwt.applyUserTokenChange(change);

        expect(storedUserJwt()).toBeNull();
        expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
        expect(jwt.isRequestedQueueFetchHeld(10, 1_500)).toBe(false);
        jwt.setUserJwt(opaque);
        rejectCurrent();
        expect(mockDispatch).toHaveBeenCalledTimes(1);
      }
    );
  });

  // Every tab shares the stored JWT and the user it names; the pause is this tab's.
  describe('other tabs', () => {
    it('uses the JWT another tab stored, and the person it names', () => {
      const bob = jwtFor('cio_b');

      storeAsAnotherTab(bob);

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'cio_b', userJwt: bob });
    });

    it('stays paused while storage holds the rejected JWT', () => {
      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      rejectCurrent();

      storeAsAnotherTab(alice);

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
    });

    it('lifts the pause when another tab stores a different JWT', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      rejectCurrent();

      storeAsAnotherTab(jwtFor('cio_a'));

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
    });

    it('lifts the pause when another tab changes the user', () => {
      rejectCurrent({ reason: 'missing' });

      holdUserToken('user-2');

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
    });

    it('keeps a pause to the tab whose JWT was rejected', async () => {
      const alice = jwtFor('cio_a');
      const otherTab = await openAnotherTab();
      jwt.setUserJwt(alice);

      rejectCurrent();

      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(true);
      expect(otherTab.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(otherTab.getRequestIdentity()).toEqual({ userToken: 'cio_a', userJwt: alice });
    });

    it('ignores a JWT this page handed over before, once another tab stored a newer one for the same person', () => {
      const older = jwtFor('cio_a');
      jwt.setUserJwt(older);
      const newer = jwtFor('cio_a');
      storeAsAnotherTab(newer);

      expect(jwt.setUserJwt(older)).toBe(false);

      expect(storedUserJwt()).toBe(newer);
    });

    it("ignores the previous person's JWT from a page whose app hasn't seen another tab sign someone else in", () => {
      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      const bob = jwtFor('cio_b');
      storeAsAnotherTab(bob);

      jwt.setUserJwt(alice);

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'cio_b', userJwt: bob });
    });

    it("doesn't sign the previous person back in after another tab signed them out", () => {
      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      localStorage.removeItem(USER_JWT_KEY);
      localStorage.removeItem(USER_TOKEN_KEY);

      jwt.setUserJwt(alice);

      expect(storedUserJwt()).toBeNull();
      expect(jwt.getRequestIdentity()).toEqual({ userToken: null, userJwt: null });
    });

    it('takes a JWT this page has not handed over before, whoever another tab signed in', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      storeAsAnotherTab(jwtFor('cio_b'));
      const carol = jwtFor('cio_c');

      expect(jwt.setUserJwt(carol)).toBe(true);

      expect(jwt.getRequestIdentity()).toEqual({ userToken: 'cio_c', userJwt: carol });
    });

    it("leaves another tab's JWT in place when a page hands over null", async () => {
      const bob = jwtFor('cio_b');
      jwt.setUserJwt(jwtFor('cio_a'));
      storeAsAnotherTab(bob);
      const freshPage = await openAnotherTab();

      jwt.setUserJwt(null);
      freshPage.setUserJwt(null);

      expect(storedUserJwt()).toBe(bob);
    });

    it('lets a page hand over again a JWT it handed over before its own clear or change of user', () => {
      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      jwt.setUserJwt(null);

      jwt.setUserJwt(alice);
      expect(storedUserJwt()).toBe(alice);

      jwt.applyUserTokenChange('cleared');
      localStorage.removeItem(USER_JWT_KEY);
      jwt.setUserJwt(alice);
      expect(storedUserJwt()).toBe(alice);
    });

    it('takes a JWT again after a reload', async () => {
      const alice = jwtFor('cio_a');
      jwt.setUserJwt(alice);
      storeAsAnotherTab(jwtFor('cio_b'));

      const reloaded = await openAnotherTab();
      reloaded.setUserJwt(alice);

      expect(storedUserJwt()).toBe(alice);
    });

    it('ignores the answer to a JWT another tab replaced while the request was out', () => {
      jwt.setUserJwt(jwtFor('cio_a'));
      const sentWith = jwt.getRequestIdentity();
      storeAsAnotherTab(jwtFor('cio_a'));

      expect(jwt.handleUserJwtRejection(rejection(EXPIRED), sentWith)).toBe(false);
      expect(jwt.isQueuePausedByUserJwtRejection()).toBe(false);
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
});
