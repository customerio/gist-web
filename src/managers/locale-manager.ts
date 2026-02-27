import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
const userLocaleLocalStoreName = "gist.web.userLocale";

export function getUserLocale(): string {
  const stored = getKeyFromLocalStore(userLocaleLocalStoreName);
  if (stored !== null) {
    return stored as string;
  }
  return navigator.language;
}

export function setUserLocale(locale: string): void {
  setKeyToLocalStore(userLocaleLocalStoreName, locale);
  log(`Set user locate to "${locale}"`);
}
