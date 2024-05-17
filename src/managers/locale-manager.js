import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
const userLocaleLocalStoreName = "gist.web.userLocale";

export function getUserLocale() {
  if (getKeyFromLocalStore(userLocaleLocalStoreName) !== null) {
    return getKeyFromLocalStore(userLocaleLocalStoreName);
  } else {
    return navigator.language;
  }
}

export function setUserLocale(locale) {
  setKeyToLocalStore(userLocaleLocalStoreName, locale);
  log(`Set user locate to "${locale}"`);
}