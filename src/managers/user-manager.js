import { log } from '../utilities/log';
import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
import { v4 as uuidv4 } from 'uuid';
const userTokenCookieName = "gist.web.userToken";
const guestUserTokenCookieName = "gist.web.guestUserToken";
const usingGuestUserTokenCookieName = "gist.web.usingGuestUserToken";

export function isUsingGuestUserToken() {
  return (getKeyFromLocalStore(usingGuestUserTokenCookieName) !== null);
}

export function getUserToken() {
  return getKeyFromLocalStore(userTokenCookieName);
}

export function setUserToken(userToken, expiryDate) {
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
  }
  setKeyWithExpiryToLocalStore(userTokenCookieName, userToken, expiryDate);
  clearKeyFromLocalStore(usingGuestUserTokenCookieName);
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);
}

export function useGuestSession() {
  var expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 365);

  // Guest sessions should never override existing sessions
  if (getUserToken() === null) {
    var guestUserToken = getKeyFromLocalStore(guestUserTokenCookieName);
    if (guestUserToken == null) {
      guestUserToken = uuidv4();
      setKeyWithExpiryToLocalStore(guestUserTokenCookieName, guestUserToken, expiryDate);
      log(`Set guest user token "${guestUserToken}" with expiry date set to 1 year from today`);
    }

    setKeyWithExpiryToLocalStore(userTokenCookieName, guestUserToken, expiryDate);
    setKeyWithExpiryToLocalStore(usingGuestUserTokenCookieName, true, expiryDate);
  }
}

export function clearUserToken() {
  clearKeyFromLocalStore(userTokenCookieName);
  log(`Cleared user token`);
}