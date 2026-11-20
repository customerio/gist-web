import { v4 as uuidv4 } from 'uuid';
import { log } from '../utilities/log';
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
} from '../utilities/local-storage';
import { userQueueNextPullCheckLocalStoreName } from '../services/queue-service';

const userTokenLocalStoreName = 'gist.web.userToken';
const usingGuestUserTokenLocalStoreName = 'gist.web.usingGuestUserToken';
const guestUserTokenLocalStoreName = 'gist.web.guestUserToken';
// The JWT the site handed over last, exactly as it was handed over (see
// user-jwt-manager). Every tab and later page load shares it, as they share the
// user token. It never reaches a URL, a log line or the debug overlay.
const userJwtLocalStoreName = 'gist.web.userJwt';
const defaultExpiryInDays = 30;

/**
 * The `sub` of a JWT's payload, which names the person the JWT was signed for.
 * Null when the payload can't be read or has no sub. Nothing is verified here:
 * Gist does that.
 */
export function readUserJwtSubject(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const binary = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    const sub = (JSON.parse(json) as { sub?: unknown } | null)?.sub;
    return typeof sub === 'string' && sub !== '' ? sub : null;
  } catch {
    return null;
  }
}

/** The JWT the site handed over last, while it's stored. */
export function getUserJwt(): string | null {
  const jwt = getKeyFromLocalStore(userJwtLocalStoreName);
  return typeof jwt === 'string' && jwt !== '' ? jwt : null;
}

export function storeUserJwt(jwt: string): void {
  // As long as a user token is kept by default. Gist enforces the JWT's own expiry.
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + defaultExpiryInDays);
  setKeyToLocalStore(userJwtLocalStoreName, jwt, expiryDate);
}

export function clearUserJwt(): void {
  clearKeyFromLocalStore(userJwtLocalStoreName);
}

function getUserJwtSubject(): string | null {
  const jwt = getUserJwt();
  return jwt === null ? null : readUserJwtSubject(jwt);
}

/** Whether the stored JWT names a person, who is then the user. */
export function isUserNamedByJwt(): boolean {
  return getUserJwtSubject() !== null;
}

function getStoredUserToken(): string | null {
  return getKeyFromLocalStore(userTokenLocalStoreName) as string | null;
}

function isGuestSessionStored(): boolean {
  return getKeyFromLocalStore(usingGuestUserTokenLocalStoreName) !== null;
}

export function isUsingGuestUserToken(): boolean {
  return !isUserNamedByJwt() && isGuestSessionStored();
}

/**
 * The user gist-web acts for, files what it caches under and sends as the user
 * token: the person the stored JWT names, or else the token setUserToken stored.
 * The JWT and the user token come from one stored value, so they name the same
 * person in every tab.
 */
export function getUserToken(): string | null {
  return getUserJwtSubject() ?? getStoredUserToken();
}

/**
 * What a setUserToken call did to the stored token: signed someone in from no
 * token or the guest token, switched from another identified user, or set the
 * token already held. While a JWT names the user, the stored token only waits
 * for the JWT to go (see gist.ts).
 */
export type UserTokenChange = 'signedIn' | 'switched' | 'unchanged';

export function setUserToken(userToken: string, expiryDate?: Date): UserTokenChange {
  const previousUserToken = getStoredUserToken();
  const wasUsingGuestUserToken = isGuestSessionStored();
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + defaultExpiryInDays);
  }
  setKeyToLocalStore(userTokenLocalStoreName, userToken, expiryDate);

  if (wasUsingGuestUserToken) {
    // Removing pull check time key so that we check the queue immediately after the userToken is set.
    clearKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    clearKeyFromLocalStore(usingGuestUserTokenLocalStoreName);
  }
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);

  if (previousUserToken === null || wasUsingGuestUserToken) {
    return 'signedIn';
  }
  return previousUserToken === userToken ? 'unchanged' : 'switched';
}

export function useGuestSession(): void {
  // Guest sessions never override a stored token. A JWT that names the user
  // doesn't stop one: the guest token waits under it, for when the JWT goes.
  if (getStoredUserToken() === null) {
    let guestUserToken = getKeyFromLocalStore(guestUserTokenLocalStoreName) as string | null;
    if (guestUserToken == null) {
      guestUserToken = uuidv4();
      setKeyToLocalStore(guestUserTokenLocalStoreName, guestUserToken);
      log(`Set guest user token "${guestUserToken}" with expiry date set to 1 year from today`);
    }

    setKeyToLocalStore(userTokenLocalStoreName, guestUserToken);
    setKeyToLocalStore(usingGuestUserTokenLocalStoreName, true);
    log(`Using anonymous session with token: "${guestUserToken}"`);
  }
}

export function isAnonymousUser(): boolean {
  return isUsingGuestUserToken();
}

export async function getHashedUserToken(): Promise<string | null> {
  const userToken = getUserToken();
  if (userToken === null) {
    return null;
  }
  return await hashString(userToken);
}

export function getEncodedUserToken(): string | null {
  const userToken = getUserToken();
  if (userToken === null) {
    return null;
  }
  return btoa(userToken);
}

export function clearUserToken(): void {
  clearKeyFromLocalStore(userTokenLocalStoreName);
  clearUserJwt();
  log(`Cleared user token`);
}

async function hashString(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
