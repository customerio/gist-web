import Cookies from 'js-cookie';
import { log } from '../utilities/log';
import { v4 as uuidv4 } from 'uuid';
const userTokenCookieName = "gist.web.userToken";
const guestUserTokenCookieName = "gist.web.guestUserToken";
const usingGuestUserTokenCookieName = "gist.web.usingGuestUserToken";

export function isUsingGuestUserToken() {
  return (Cookies.get(usingGuestUserTokenCookieName) !== undefined);
}

export function getUserToken() {
  return Cookies.get(userTokenCookieName);
}

export function setUserToken(userToken, expiryDate) {
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
  }
  Cookies.set(userTokenCookieName, userToken, {expires: expiryDate});
  Cookies.remove(usingGuestUserTokenCookieName);
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);
}

export function useGuestSession() {
  // Guest sessions should never override existing sessions
  if (getUserToken() === undefined) {
    var guestUserToken = Cookies.get(guestUserTokenCookieName)
    if (guestUserToken == undefined) {
      guestUserToken = uuidv4();
      Cookies.set(guestUserTokenCookieName, guestUserToken, {expires: 365});
      log(`Set guest user token "${guestUserToken}" with expiry date set to 1 year from today`);
    }
    Cookies.set(userTokenCookieName, guestUserToken, {expires: 365});
    Cookies.set(usingGuestUserTokenCookieName, true, {expires: 365});
  }
}

export function clearUserToken() {
  Cookies.remove(userTokenCookieName);
  log(`Cleared user token`);
}