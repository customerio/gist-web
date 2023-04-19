import { log } from '../utilities/log';
import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
import { v4 as uuidv4 } from 'uuid';
const userTokenLocalStoreName = "gist.web.userToken";
const guestUserTokenLocalStoreName = "gist.web.guestUserToken";
const usingGuestUserTokenLocalStoreName = "gist.web.usingGuestUserToken";

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
  clearKeyFromLocalStore(usingGuestUserTokenLocalStoreName);
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);
}

export function useGuestSession() {
  var expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 365);

  // Guest sessions should never override existing sessions
  if (getUserToken() === null) {
    var guestUserToken = getKeyFromLocalStore(guestUserTokenLocalStoreName);
    if (guestUserToken == null) {
      guestUserToken = uuidv4();
      setKeyWithExpiryToLocalStore(guestUserTokenLocalStoreName, guestUserToken, expiryDate);
      log(`Set guest user token "${guestUserToken}" with expiry date set to 1 year from today`);
    }

    setKeyWithExpiryToLocalStore(userTokenLocalStoreName, guestUserToken, expiryDate);
    setKeyWithExpiryToLocalStore(usingGuestUserTokenLocalStoreName, true, expiryDate);
  }
}

export function clearUserToken() {
  clearKeyFromLocalStore(userTokenLocalStoreName);
  log(`Cleared user token`);
}