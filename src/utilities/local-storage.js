const maxExpiryDays = 365;
var persistSession = true;

// Switches between local and session storage
export function shouldPersistSession(session) {
    persistSession = session;
}

export function setKeyToLocalStore(key, value, ttl = null) {
    var expiryDate = ttl;
    if (!expiryDate) {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + maxExpiryDays);
    }
    const item = {
        value: value,
        expiry: expiryDate,
    };
    getStorage().setItem(key, JSON.stringify(item));
}

export function getKeyFromLocalStore(key) {
    const itemStr = getStorage().getItem(key);
    if (!itemStr) return null;

    const item = JSON.parse(itemStr);
    const now = new Date();
    if (now.getTime() > new Date(item.expiry).getTime()) {
        clearKeyFromLocalStore(key);
        return null;
    }
    return item.value;
}

export function clearKeyFromLocalStore(key) {
    getStorage().removeItem(key);
}

// Helper function to select the correct storage based on the session flag
function getStorage() {
    return persistSession ? localStorage : sessionStorage;
}