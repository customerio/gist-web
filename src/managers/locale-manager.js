import { log } from '../utilities/log';
import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
const userLocaleLocalStoreName = "gist.web.userLocale";

export function getUserLocale() {
  if (getKeyFromLocalStore(userLocaleLocalStoreName) !== null) {
    return getKeyFromLocalStore(userLocaleLocalStoreName);
  } else {
    return navigator.language;
  }
}

export function setUserLocale(locale) {
  if (expiryDate === undefined) {
    expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 365);
  }
  setKeyWithExpiryToLocalStore(userLocaleLocalStoreName, locale, expiryDate);
  log(`Set user token "${userToken}" with expiry date set to ${expiryDate}`);
}