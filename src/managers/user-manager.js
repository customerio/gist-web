import { log } from '../utilities/log';
import { setKeyWithExpiryToLocalStore, setKeyToLocalStore, getKeyFromLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
import { v4 as uuidv4 } from 'uuid';
const userTokenLocalStoreName = "gist.web.userToken";
const guestUserTokenLocalStoreName = "gist.web.guestUserToken";
const usingGuestUserTokenLocalStoreName = "gist.web.usingGuestUserToken";
import { userQueueNextPullCheckLocalStoreName } from '../services/queue-service';

export function isUsingGuestUserToken() {
  return (getKeyFromLocalStore(usingGuestUserTokenLocalStoreName) !== null);
}

export function getUserToken() {
  return getKeyFromLocalStore(userTokenLocalStoreName);
}

export function setUserToken(userToken, expiryDate) {
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
  }
  setKeyWithExpiryToLocalStore(userTokenLocalStoreName, userToken, expiryDate);

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
      log(`Set guest user token "${guestUserToken}"`);
    }

    setKeyToLocalStore(userTokenLocalStoreName, guestUserToken);
    setKeyToLocalStore(usingGuestUserTokenLocalStoreName, true);
  }
}

export function clearUserToken() {
  clearKeyFromLocalStore(userTokenLocalStoreName);
  log(`Cleared user token`);
}