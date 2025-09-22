import { log } from '../utilities/log';
import { setKeyToLocalStore, getKeyFromLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';

const customAttributesLocalStoreName = "gist.web.customAttributes";
const defaultExpiryInDays = 30;

// Internal map to store custom attributes in memory
let customAttributesMap = new Map();

function loadCustomAttributesFromStorage() {
  const storedAttributes = getKeyFromLocalStore(customAttributesLocalStoreName);
  if (storedAttributes) {
    try {
      customAttributesMap = new Map(storedAttributes);
    } catch {
      customAttributesMap = new Map();
    }
  } else {
    customAttributesMap = new Map();
  }
}

function saveCustomAttributesToStorage() {
  const attributesArray = Array.from(customAttributesMap.entries());
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + defaultExpiryInDays);
  
  setKeyToLocalStore(customAttributesLocalStoreName, attributesArray, expiryDate);
  log(`Saved ${customAttributesMap.size} custom attributes to storage with TTL of ${defaultExpiryInDays} days`);
}

loadCustomAttributesFromStorage();

export function setCustomAttribute(key, value) {
  if (!key || typeof key !== 'string') {
    log(`Invalid key for custom attribute: ${key}`);
    return false;
  }
  
  customAttributesMap.set(key, value);
  saveCustomAttributesToStorage();
  log(`Set custom attribute "${key}" to "${value}"`);
  return true;
}

export function getCustomAttribute(key) {
  if (!key || typeof key !== 'string') {
    log(`Invalid key for custom attribute: ${key}`);
    return null;
  }
  
  return customAttributesMap.get(key) || null;
}

export function getAllCustomAttributes() {
  return new Map(customAttributesMap);
}

export function clearCustomAttributes() {
  customAttributesMap.clear();
  clearKeyFromLocalStore(customAttributesLocalStoreName);
  log(`Cleared all custom attributes`);
}

export function removeCustomAttribute(key) {
  if (!key || typeof key !== 'string') {
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
