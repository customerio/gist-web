import { v4 as uuidv4 } from 'uuid';
import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
import { userQueueNextPullCheckLocalStoreName } from '../services/queue-service';

const userTokenLocalStoreName = "gist.web.userToken";
const usingGuestUserTokenLocalStoreName = "gist.web.usingGuestUserToken";
const guestUserTokenLocalStoreName = "gist.web.guestUserToken";
const defaultExpiryInDays = 30;

export function isUsingGuestUserToken() {
  return (getKeyFromLocalStore(usingGuestUserTokenLocalStoreName) !== null);
}

export function getUserToken() {
  return getKeyFromLocalStore(userTokenLocalStoreName);
}

export function setUserToken(userToken, expiryDate) {
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + defaultExpiryInDays);
  }
  setKeyToLocalStore(userTokenLocalStoreName, userToken, expiryDate);

  if (isUsingGuestUserToken()) {
    // Removing pull check time key so that we check the queue immediately after the userToken is set.
    clearKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    clearKeyFromLocalStore(usingGuestUserTokenLocalStoreName);
  }
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);
}

export function useGuestSession() {
  // Guest sessions should never override existing sessions
  if (getUserToken() === null) {
    var guestUserToken = getKeyFromLocalStore(guestUserTokenLocalStoreName);
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

export function isAnonymousUser() {
  return isUsingGuestUserToken();
}

export async function getHashedUserToken() {
  var userToken = getUserToken();
  if (userToken === null) {
    return null;
  }
  return await hashString(userToken);
}

export function clearUserToken() {
  clearKeyFromLocalStore(userTokenLocalStoreName);
  log(`Cleared user token`);
}

async function hashString(message) {
  // Encode the message as a Uint8Array
  const encoder = new TextEncoder();
  const data = encoder.encode(message);

  // Hash the message using the SHA-256 algorithm
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert the hash to a hexadecimal string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

  return hashHex;
}