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
    const expiryTime = new Date(item.expiry);
    
    // Retroactive bugfix: remove old cache entries with long expiry times
    const isBroadcastOrUserKey = (key.startsWith("gist.web.message.broadcasts") && !key.endsWith("shouldShow") && !key.endsWith("numberOfTimesShown")) || key.startsWith("gist.web.message.user");
    const sixtyMinutesFromNow = new Date(now.getTime() + 61 * 60 * 1000);
    if (isBroadcastOrUserKey && expiryTime.getTime() > sixtyMinutesFromNow.getTime()) {
        clearKeyFromLocalStore(key);
        return null;
    }
    
    if (now.getTime() > expiryTime.getTime()) {
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