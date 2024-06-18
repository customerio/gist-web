const maxExpiryDays = 365;

const isPersistingSessionLocalStoreName = "gist.web.isPersistingSession";

// Switches between local and session storage
export function shouldPersistSession(presisted) {
    sessionStorage.setItem(isPersistingSessionLocalStoreName, presisted);
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

export function isSessionBeingPersisted() {
    const currentValue = sessionStorage.getItem(isPersistingSessionLocalStoreName);
    if (currentValue === null) {
        sessionStorage.setItem(isPersistingSessionLocalStoreName, "true");
        return true;
    }
    return currentValue === "true";
}

// Helper function to select the correct storage based on the session flag
function getStorage() {
    return isSessionBeingPersisted() ? localStorage : sessionStorage;
}