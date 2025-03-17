import { UserNetworkInstance } from './network';
import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { log } from "../utilities/log";
import { isUsingGuestUserToken } from '../managers/user-manager';
import { getUserLocale } from '../managers/locale-manager';
import { settings } from './settings';
import { v4 as uuidv4 } from 'uuid';

const defaultPollingDelayInSeconds = 600;
var currentPollingDelayInSeconds = defaultPollingDelayInSeconds;
var checkInProgress = false;

export const userQueueNextPullCheckLocalStoreName = "gist.web.userQueueNextPullCheck";
export const sessionIdLocalStoreName = "gist.web.sessionId";
export async function getUserQueue() {
  var response;
  try {
    if (!checkInProgress) {
      checkInProgress = true;
      var headers = {
        "X-Gist-User-Anonymous": isUsingGuestUserToken(),
        "Content-Language": getUserLocale()
      }

      if (settings.getQueueAPIVersion() === "3") {
        response = await UserNetworkInstance().post(`/api/v3/users?sessionId=${getSessionId()}`, {}, { headers: headers });
      } else {
        var timestamp = new Date().getTime();
        response = await UserNetworkInstance().post(`/api/v2/users?timestamp=${timestamp}`, {}, { headers: headers });
      }
    }
  } catch (error) {
    if (error.response) {
      response = error.response;
    } else {
      log(`Error getting user queue: ${error}`);
    }
  } finally {
    checkInProgress = false;
    scheduleNextQueuePull(response);
    setQueueAPIVersion(response);
  }

  return response;
}

function setQueueAPIVersion(response) {
  if (response && response.headers) {
    var queueVersion = response.headers["x-cio-queue-version"];
    if (queueVersion) {
      settings.setQueueAPIVersion(queueVersion);
    }
  }
}

function getSessionId() {
  var sessionId = getKeyFromLocalStore(sessionIdLocalStoreName);
  if (!sessionId) {
    sessionId = uuidv4();
  }
  // The session ID TTL is renewed with every poll request and extended by 10 minutes.
  setKeyToLocalStore(sessionIdLocalStoreName, sessionId, new Date(new Date().getTime() + 600000));
  return sessionId;
}

function scheduleNextQueuePull(response) {
  if (response && response.headers) {
    var pollingInterval = response.headers['x-gist-queue-polling-interval'];
    if (pollingInterval && pollingInterval > 0) {
      currentPollingDelayInSeconds = pollingInterval;
    }
  }
  var expiryDate = new Date(new Date().getTime() + currentPollingDelayInSeconds * 1000);
  setKeyToLocalStore(userQueueNextPullCheckLocalStoreName, currentPollingDelayInSeconds, expiryDate);
}
