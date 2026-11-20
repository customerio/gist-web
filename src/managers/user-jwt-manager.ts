import Gist from '../gist';
import { log } from '../utilities/log';
import {
  clearKeyFromLocalStore,
  getKeyFromLocalStore,
  setKeyToLocalStore,
} from '../utilities/local-storage';
import { getUserToken } from './user-manager';
import type { UserTokenChange } from './user-manager';
import type { NetworkResponse } from '../services/network';

/** What `userJwtRejected` carries. `reason` is absent when Gist's 401 has no body. */
export interface UserJwtRejectedEvent {
  reason?: string;
}

/** The user token and JWT a request to Gist was sent with. */
export interface RequestIdentity {
  userToken: string | null;
  userJwt: string | null;
}

// The JWT is kept in gist-web's storage beside the user token, so every tab and
// later page loads use the one the app handed over last. It's stored with the
// user token it was handed over for and used only while that token is current, so
// a switch of user in another tab can't pair one person's JWT with another's
// token. It never reaches a URL, a log line or the debug overlay.
const userJwtLocalStoreName = 'gist.web.userJwt';
// As long as a user token is kept by default. Sign-out, a switch of user or a new
// JWT replaces it sooner, and Gist enforces the JWT's own expiry.
const userJwtExpiryInDays = 30;

interface StoredUserJwt {
  jwt: string;
  userToken: string | null;
}

// The rest belongs to this tab and lives in memory, so a rejection leaves other
// tabs alone.
// The user token this page last applied itself: through its own setUserToken,
// clearUserToken or setup, or what storage held when it first looked. When storage
// names someone else, another tab changed the user while this page's app may still
// act for the previous person, so its setUserJwt calls are ignored until it applies
// a user itself or reloads.
let userTokenAppliedHere: string | null | undefined;
// After a counted rejection, no queue fetch until a different JWT or a user change.
let queuePaused = false;
// The JWT whose rejection paused the queue; a different one in storage lifts the
// pause, so a JWT handed over in another tab reaches this one too.
let pausedForUserJwt: string | null = null;
// setUserJwt asked for a queue fetch that hasn't been sent yet.
let queueFetchRequested = false;
// From a counted rejection until a queue fetch succeeds or the user changes, the
// fetches setUserJwt asks for go at most once per polling interval, so an app
// that answers every rejection with another JWT can't loop faster than polling.
let rejectedSinceLastSuccess = false;
let lastRequestedFetchAt: number | null = null;
// The JWT values, no JWT included, whose rejection the app has been told about.
const rejectionsReported = new Set<string | null>();

function readStoredUserJwt(): StoredUserJwt | null {
  const stored = getKeyFromLocalStore(userJwtLocalStoreName) as
    | Partial<StoredUserJwt>
    | null
    | undefined;
  if (!stored || typeof stored.jwt !== 'string' || stored.jwt === '') return null;
  return {
    jwt: stored.jwt,
    userToken: typeof stored.userToken === 'string' ? stored.userToken : null,
  };
}

function storeUserJwt(jwt: string, userToken: string | null): void {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + userJwtExpiryInDays);
  setKeyToLocalStore(userJwtLocalStoreName, { jwt, userToken }, expiryDate);
}

/** The JWT to send: the stored one, while the user token it was handed over for is current. */
export function getUserJwt(): string | null {
  const stored = readStoredUserJwt();
  if (stored === null) return null;
  return stored.userToken === getUserToken() ? stored.jwt : null;
}

function getUserTokenAppliedHere(): string | null {
  if (userTokenAppliedHere === undefined) {
    userTokenAppliedHere = getUserToken();
  }
  return userTokenAppliedHere;
}

/** Records the user token this page has just applied itself, such as a guest session. */
export function noteUserTokenAppliedHere(): void {
  userTokenAppliedHere = getUserToken();
}

export function setUserJwt(jwt: string | null): void {
  if (getUserToken() !== getUserTokenAppliedHere()) {
    log('User JWT ignored: another tab changed the user since this page did.');
    return;
  }
  const value = typeof jwt === 'string' ? jwt.trim() : '';
  const next = value === '' ? null : value;
  // The JWT already in use changes nothing unless a rejection paused the queue,
  // so a site can hand it over as often as it likes without extra fetches.
  if (next === getUserJwt() && !queuePaused) {
    log('User JWT unchanged.');
    return;
  }
  if (next === null) {
    clearKeyFromLocalStore(userJwtLocalStoreName);
  } else {
    storeUserJwt(next, getUserToken());
  }
  queuePaused = false;
  queueFetchRequested = true;
  log(next === null ? 'User JWT cleared.' : 'User JWT set.');
}

/**
 * Applies a change of user made in this tab to the stored JWT, which every tab
 * shares. Signing in keeps a JWT handed over while nobody was signed in (no user
 * token yet, or the guest token), because an app that calls setUserJwt right after
 * identify() reaches gist-web first; it then belongs to the user who signed in.
 * Switching to another user or signing out drops it. Any change of user lifts this
 * tab's pause and starts the one-event-per-JWT count over; setting the same token
 * changes nothing.
 */
export function applyUserTokenChange(
  change: UserTokenChange | 'cleared',
  previousUserToken: string | null = null
): void {
  noteUserTokenAppliedHere();
  if (change === 'unchanged') return;
  const stored = readStoredUserJwt();
  if (
    change === 'signedIn' &&
    stored !== null &&
    (stored.userToken === null || stored.userToken === previousUserToken)
  ) {
    storeUserJwt(stored.jwt, getUserToken());
  } else if (stored !== null) {
    clearKeyFromLocalStore(userJwtLocalStoreName);
  }
  queuePaused = false;
  pausedForUserJwt = null;
  rejectedSinceLastSuccess = false;
  lastRequestedFetchAt = null;
  rejectionsReported.clear();
}

export function getRequestIdentity(): RequestIdentity {
  return { userToken: getUserToken(), userJwt: getUserJwt() };
}

export function isQueuePausedByUserJwtRejection(): boolean {
  if (queuePaused && getUserJwt() !== pausedForUserJwt) {
    // Another tab handed over a new JWT, or switched to another user.
    log('User JWT changed in another tab, queue fetches resume.');
    queuePaused = false;
  }
  return queuePaused;
}

export function isQueueFetchRequested(): boolean {
  return queueFetchRequested;
}

/**
 * Whether the fetch setUserJwt asked for has to wait. After a rejection the
 * first one goes straight away, and each later one waits until a polling
 * interval has passed since the one before.
 */
export function isRequestedQueueFetchHeld(
  pollingIntervalSeconds: number,
  now: number = Date.now()
): boolean {
  return (
    rejectedSinceLastSuccess &&
    lastRequestedFetchAt !== null &&
    now < lastRequestedFetchAt + pollingIntervalSeconds * 1000
  );
}

/** Called as a queue fetch is sent: it carries the fetch setUserJwt asked for. */
export function markQueueFetchSent(now: number = Date.now()): void {
  if (!queueFetchRequested) return;
  queueFetchRequested = false;
  if (rejectedSinceLastSuccess) {
    lastRequestedFetchAt = now;
  }
}

export function markQueueFetchSucceeded(): void {
  rejectedSinceLastSuccess = false;
  lastRequestedFetchAt = null;
}

/**
 * Reads Gist's answer to one of the calls it enforces: the queue fetch, an inbox
 * open-state update or a view log. A 401 rejects the JWT the request carried,
 * whatever its body. It counts only while the request's user token and JWT are
 * still this tab's, since an answer to an earlier user or JWT says nothing about
 * the current one. A counted rejection pauses this tab's queue fetches and
 * dispatches `userJwtRejected` once per JWT value. Returns whether it counted.
 */
export function handleUserJwtRejection(
  response: NetworkResponse | undefined,
  sentWith: RequestIdentity
): boolean {
  if (response?.status !== 401) return false;
  const current = getRequestIdentity();
  if (sentWith.userToken !== current.userToken || sentWith.userJwt !== current.userJwt) {
    return false;
  }

  // Set before dispatching, so a listener that calls setUserJwt lifts the pause.
  queuePaused = true;
  pausedForUserJwt = sentWith.userJwt;
  rejectedSinceLastSuccess = true;
  if (rejectionsReported.has(sentWith.userJwt)) {
    log('User JWT rejected again, queue fetches stay paused.');
    return true;
  }
  rejectionsReported.add(sentWith.userJwt);

  const event: UserJwtRejectedEvent = {};
  const reason = rejectionReason(response.data);
  if (reason !== undefined) {
    event.reason = reason;
  }
  log(`User JWT rejected (${reason ?? 'no reason'}), queue fetches paused.`);
  Gist.events?.dispatch('userJwtRejected', event);
  return true;
}

function rejectionReason(data: unknown): string | undefined {
  if (data === null || typeof data !== 'object') return undefined;
  const reason = (data as { reason?: unknown }).reason;
  return typeof reason === 'string' ? reason : undefined;
}
