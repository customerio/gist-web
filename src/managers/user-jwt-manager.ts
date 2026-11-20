import Gist from '../gist';
import { log } from '../utilities/log';
import { clearUserJwt, getUserJwt, getUserToken, storeUserJwt } from './user-manager';
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

// The JWT itself is stored beside the user token (see user-manager), so every tab
// and later page load sends the one the site handed over last. While its sub names
// a person, that person is the user token, so a request never pairs one person's
// JWT with another's token, and what gist-web caches is filed under the person
// whose queue Gist served.
//
// The rest belongs to this tab and lives in memory, so a rejection leaves other
// tabs alone.

// The JWTs this page's app has handed over, and the stored JWT this page left
// last: the one it handed over, also when it found that one stored already, or
// none after it cleared the JWT or the user. Once another tab has changed the
// stored JWT, this page can bring only a JWT it hasn't handed over before. So an
// app that still holds an older JWT can't undo a newer one another tab stored,
// for the same person or someone else, or sign the previous person back in after
// another tab signed them out, and its null can't take the JWT away from whoever
// another tab signed in. Only the latest few are kept: a site renews short-lived
// JWTs, so an older one has expired.
const handedOverHere = new Set<string>();
const handedOverKept = 20;
let lastStoredHere: string | null = null;
// After a counted rejection, no queue fetch until a different JWT or user.
let queuePaused = false;
// The JWT whose rejection paused the queue; a different one in storage lifts the
// pause, so another tab's new JWT reaches this one too.
let pausedForUserJwt: string | null = null;
// The user token of the request whose rejection last counted. Another tab's
// change of user starts this tab over, as a change made here does.
let userTokenAtRejection: string | null = null;
// setUserJwt asked for a queue fetch that hasn't been sent yet.
let queueFetchRequested = false;
// From a counted rejection until a queue fetch succeeds or the user changes, the
// fetches setUserJwt asks for go at most once per polling interval, so an app
// that answers every rejection with another JWT can't loop faster than polling.
let rejectedSinceLastSuccess = false;
let lastRequestedFetchAt: number | null = null;
// The JWT values, no JWT included, whose rejection the app has been told about.
const rejectionsReported = new Set<string | null>();

function mayHandOver(jwt: string | null): boolean {
  const stored = getUserJwt();
  if (jwt === stored || stored === lastStoredHere) return true;
  return jwt !== null && !handedOverHere.has(jwt);
}

// A value a request header can't carry would make every request fail, in every
// tab, with no rejection to tell the app.
function canGoInAHeader(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === 0 || code === 10 || code === 13 || code > 0xff) return false;
  }
  return true;
}

function startOverForNewUser(): void {
  queuePaused = false;
  pausedForUserJwt = null;
  rejectedSinceLastSuccess = false;
  lastRequestedFetchAt = null;
  rejectionsReported.clear();
}

/**
 * Takes the JWT the site handed over, or null to clear it, and returns whether
 * the user changed with it, so the caller can restart what belongs to the user.
 */
export function setUserJwt(jwt: string | null): boolean {
  const value = typeof jwt === 'string' ? jwt.trim() : '';
  const next = value === '' ? null : value;
  if (next !== null && !canGoInAHeader(next)) {
    log("User JWT ignored: a request header can't carry it.");
    return false;
  }
  if (!mayHandOver(next)) {
    log(
      next === null
        ? 'User JWT left in place: another tab handed it over.'
        : 'User JWT ignored: another tab has replaced it since this page handed it over.'
    );
    return false;
  }
  // Recorded before the check below: a page's app hands over its JWT on every
  // load, and mostly finds it stored already.
  if (next !== null) {
    handedOverHere.add(next);
    if (handedOverHere.size > handedOverKept) {
      handedOverHere.delete(handedOverHere.values().next().value as string);
    }
  }
  lastStoredHere = next;
  // Handing over again the JWT in use changes nothing unless a rejection paused
  // the queue, so a site can call this as often as it likes without extra fetches.
  if (next === getUserJwt() && !queuePaused) {
    log('User JWT unchanged.');
    return false;
  }

  const previousUserToken = getUserToken();
  if (next === null) {
    clearUserJwt();
  } else {
    storeUserJwt(next);
  }
  const userChanged = getUserToken() !== previousUserToken;
  if (userChanged) {
    startOverForNewUser();
  }
  queuePaused = false;
  queueFetchRequested = true;
  log(next === null ? 'User JWT cleared.' : 'User JWT set.');
  return userChanged;
}

/**
 * Applies a change of user made with setUserToken or clearUserToken in this tab.
 * setUserToken changes the user only while no stored JWT names one (see gist.ts),
 * so a JWT still stored then names nobody, and it goes. Any change of user also
 * lifts this tab's pause and starts the one-event-per-JWT count over; setting the
 * same token changes nothing.
 */
export function applyUserTokenChange(change: UserTokenChange | 'cleared'): void {
  if (change === 'unchanged') return;
  if (getUserJwt() !== null) {
    clearUserJwt();
  }
  lastStoredHere = null;
  startOverForNewUser();
}

export function getRequestIdentity(): RequestIdentity {
  return { userToken: getUserToken(), userJwt: getUserJwt() };
}

export function isQueuePausedByUserJwtRejection(): boolean {
  const current = getRequestIdentity();
  if (rejectedSinceLastSuccess && current.userToken !== userTokenAtRejection) {
    log('User changed in another tab, queue fetches start over.');
    startOverForNewUser();
  }
  if (queuePaused && current.userJwt !== pausedForUserJwt) {
    log('User JWT changed in another tab, queue fetches resume.');
    queuePaused = false;
    pausedForUserJwt = null;
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
  userTokenAtRejection = sentWith.userToken;
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
