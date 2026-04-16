import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore, STORAGE_KEYS } from '../utilities/local-storage';

export function getUserLocale(): string {
  const stored = getKeyFromLocalStore(STORAGE_KEYS.userLocale);
  if (stored !== null) {
    return stored as string;
  }
  return navigator.language;
}

export function setUserLocale(locale: string): void {
  setKeyToLocalStore(STORAGE_KEYS.userLocale, locale);
  log(`Set user locate to "${locale}"`);
}
