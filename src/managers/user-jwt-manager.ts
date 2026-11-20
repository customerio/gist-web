import Gist from '../gist';
import { log } from '../utilities/log';
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

// Everything here belongs to this tab and lives in memory only: the JWT never
// reaches storage, a URL or a log line, and a rejection leaves other tabs alone.
let userJwt: string | null = null;
// After a counted rejection, no queue fetch until setUserJwt or a user change.
let queuePaused = false;
// setUserJwt asked for a queue fetch that hasn't been sent yet.
let queueFetchRequested = false;
// From a counted rejection until a queue fetch succeeds or the user changes, the
// fetches setUserJwt asks for go at most once per polling interval, so an app
// that answers every rejection with another JWT can't loop faster than polling.
let rejectedSinceLastSuccess = false;
let lastRequestedFetchAt: number | null = null;
// The JWT values, no JWT included, whose rejection the app has been told about.
const rejectionsReported = new Set<string | null>();

export function getUserJwt(): string | null {
  return userJwt;
}

export function setUserJwt(jwt: string | null): void {
  const value = typeof jwt === 'string' ? jwt.trim() : '';
  const next = value === '' ? null : value;
  // The JWT this tab already holds changes nothing unless a rejection paused the
  // queue, so a site can hand it over as often as it likes without extra fetches.
  if (next === userJwt && !queuePaused) {
    log('User JWT unchanged.');
    return;
  }
  userJwt = next;
  queuePaused = false;
  queueFetchRequested = true;
  log(userJwt === null ? 'User JWT cleared.' : 'User JWT set.');
}

/**
 * Applies a change of user to the JWT. Signing in keeps it, because an app that
 * calls setUserJwt right after identify() reaches gist-web first. Switching to
 * another user or signing out drops it. Any change of user lifts the pause and
 * starts the one-event-per-JWT count over; setting the same token changes nothing.
 */
export function applyUserTokenChange(change: UserTokenChange | 'cleared'): void {
  if (change === 'unchanged') return;
  if (change === 'switched' || change === 'cleared') {
    userJwt = null;
  }
  queuePaused = false;
  rejectedSinceLastSuccess = false;
  lastRequestedFetchAt = null;
  rejectionsReported.clear();
}

export function getRequestIdentity(): RequestIdentity {
  return { userToken: getUserToken(), userJwt };
}

export function isQueuePausedByUserJwtRejection(): boolean {
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
  if (sentWith.userToken !== getUserToken() || sentWith.userJwt !== userJwt) return false;

  // Set before dispatching, so a listener that calls setUserJwt lifts the pause.
  queuePaused = true;
  rejectedSinceLastSuccess = true;
  if (rejectionsReported.has(userJwt)) {
    log('User JWT rejected again, queue fetches stay paused.');
    return true;
  }
  rejectionsReported.add(userJwt);

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
