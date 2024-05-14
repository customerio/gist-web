export function setKeyToLocalStore(key, value) {
    let maxExpiryDate = new Date();
    maxExpiryDate.setDate(maxExpiryDate.getDate() + 365);
    const item = {
        value: value,
        expiry: maxExpiryDate,
    };
    localStorage.setItem(key, JSON.stringify(item));
}

export function setKeyWithExpiryToLocalStore(key, value, ttl) {
    const item = {
        value: value,
        expiry: ttl,
    };
    localStorage.setItem(key, JSON.stringify(item));
}
  
export function getKeyFromLocalStore(key) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) {
        return null;
    }
    const item = JSON.parse(itemStr);
    const now = new Date();
    const itemExpiry = new Date(item.expiry);
    if (now.getTime() > itemExpiry.getTime()) {
        localStorage.removeItem(key);
        return null;
    }
    return item.value;
}
  
export function clearKeyFromLocalStore(key) {
    localStorage.removeItem(key);
}