import { v4 as uuidv4 } from 'uuid';
import { log } from '../utilities/log';
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
  STORAGE_KEYS,
} from '../utilities/local-storage';

const defaultExpiryInDays = 30;

export function isUsingGuestUserToken(): boolean {
  return getKeyFromLocalStore(STORAGE_KEYS.usingGuestUserToken) !== null;
}

export function getUserToken(): string | null {
  return getKeyFromLocalStore(STORAGE_KEYS.userToken) as string | null;
}

export function setUserToken(userToken: string, expiryDate?: Date): void {
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + defaultExpiryInDays);
  }
  setKeyToLocalStore(STORAGE_KEYS.userToken, userToken, expiryDate);

  if (isUsingGuestUserToken()) {
    // Removing pull check time key so that we check the queue immediately after the userToken is set.
    clearKeyFromLocalStore(STORAGE_KEYS.userQueueNextPullCheck);
    clearKeyFromLocalStore(STORAGE_KEYS.usingGuestUserToken);
  }
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);
}

export function useGuestSession(): void {
  // Guest sessions should never override existing sessions
  if (getUserToken() === null) {
    let guestUserToken = getKeyFromLocalStore(STORAGE_KEYS.guestUserToken) as string | null;
    if (guestUserToken == null) {
      guestUserToken = uuidv4();
      setKeyToLocalStore(STORAGE_KEYS.guestUserToken, guestUserToken);
      log(`Set guest user token "${guestUserToken}" with expiry date set to 1 year from today`);
    }

    setKeyToLocalStore(STORAGE_KEYS.userToken, guestUserToken);
    setKeyToLocalStore(STORAGE_KEYS.usingGuestUserToken, true);
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
  clearKeyFromLocalStore(STORAGE_KEYS.userToken);
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
