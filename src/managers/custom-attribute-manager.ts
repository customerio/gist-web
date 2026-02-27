import { log } from "../utilities/log";
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
} from "../utilities/local-storage";

const customAttributesLocalStoreName = "gist.web.customAttributes";
const defaultExpiryInDays = 30;

let customAttributesMap: Map<string, unknown> = new Map();

function loadCustomAttributesFromStorage(): void {
  const storedAttributes = getKeyFromLocalStore(customAttributesLocalStoreName);
  if (storedAttributes) {
    try {
      customAttributesMap = new Map(
        storedAttributes as Iterable<[string, unknown]>,
      );
    } catch {
      customAttributesMap = new Map();
    }
  } else {
    customAttributesMap = new Map();
  }
}

function saveCustomAttributesToStorage(): void {
  const attributesArray = Array.from(customAttributesMap.entries());
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + defaultExpiryInDays);
  setKeyToLocalStore(
    customAttributesLocalStoreName,
    attributesArray,
    expiryDate,
  );
  log(
    `Saved ${customAttributesMap.size} custom attributes to storage with TTL of ${defaultExpiryInDays} days`,
  );
}

loadCustomAttributesFromStorage();

export function setCustomAttribute(key: string, value: unknown): boolean {
  if (!key || typeof key !== "string") {
    log(`Invalid key for custom attribute: ${key}`);
    return false;
  }
  customAttributesMap.set(key, value);
  saveCustomAttributesToStorage();
  log(`Set custom attribute "${key}" to "${value}"`);
  return true;
}

export function getCustomAttribute(key: string): unknown | null {
  if (!key || typeof key !== "string") {
    log(`Invalid key for custom attribute: ${key}`);
    return null;
  }
  return customAttributesMap.get(key) || null;
}

export function getAllCustomAttributes(): Map<string, unknown> {
  return new Map(customAttributesMap);
}

export function clearCustomAttributes(): void {
  customAttributesMap.clear();
  clearKeyFromLocalStore(customAttributesLocalStoreName);
  log(`Cleared all custom attributes`);
}

export function removeCustomAttribute(key: string): boolean {
  if (!key || typeof key !== "string") {
    log(`Invalid key for custom attribute: ${key}`);
    return false;
  }
  const existed = customAttributesMap.has(key);
  customAttributesMap.delete(key);
  if (customAttributesMap.size > 0) {
    saveCustomAttributesToStorage();
  } else {
    clearKeyFromLocalStore(customAttributesLocalStoreName);
  }
  log(`Removed custom attribute "${key}"`);
  return existed;
}
