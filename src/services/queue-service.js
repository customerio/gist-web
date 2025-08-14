import Gist from '../gist';
import { UserNetworkInstance } from './network';
import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { log } from "../utilities/log";
import { isUsingGuestUserToken, getEncodedUserToken } from '../managers/user-manager';
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
      response = await UserNetworkInstance().post(`/api/v3/users?sessionId=${getSessionId()}`, {}, { headers: headers });
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
    setQueueUseSSE(response);
  }

  return response;
}

function setQueueUseSSE(response) {
  const useSSE = response?.headers?.["x-cio-use-sse"]?.toLowerCase() === "true";
  settings.setUseSSEFlag(useSSE);
}

function getSessionId() {
  var sessionId = getKeyFromLocalStore(sessionIdLocalStoreName);
  if (!sessionId) {
    sessionId = uuidv4();
  }
  // The session ID TTL is renewed with every poll request and extended by 30 minutes.
  setKeyToLocalStore(sessionIdLocalStoreName, sessionId, new Date(new Date().getTime() + 1800000));
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

export function getQueueSSEEndpoint() {
  var encodedUserToken = getEncodedUserToken();
  if (encodedUserToken === null) {
    log("No user token available for SSE endpoint.");
    return null;
  }
  return settings.GIST_QUEUE_REALTIME_API_ENDPOINT[Gist.config.env] + `/api/v3/sse?userToken=${encodedUserToken}&siteId=${Gist.config.siteId}&sessionId=${getSessionId()}`;
}