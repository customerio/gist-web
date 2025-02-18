import { UserNetworkInstance } from './network';
import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { log } from "../utilities/log";
import { isUsingGuestUserToken } from '../managers/user-manager';
import { getUserLocale } from '../managers/locale-manager';
import { settings } from './settings';

const CIOInstanceIdHeader = "X-CIO-Instance-Id";
const defaultPollingDelayInSeconds = 600;
var currentPollingDelayInSeconds = defaultPollingDelayInSeconds;
var checkInProgress = false;

export const userQueueNextPullCheckLocalStoreName = "gist.web.userQueueNextPullCheck";
export const stickyInstanceIdLocalStoreName = "gist.web.stickyInstanceId";
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
        if (getKeyFromLocalStore(stickyInstanceIdLocalStoreName) !== null) {
          headers[CIOInstanceIdHeader] = getKeyFromLocalStore(stickyInstanceIdLocalStoreName);
        }
        response = await UserNetworkInstance().post(`/api/v3/users`, {}, { headers: headers });
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
    setStickySessionHeader(response)
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

function setStickySessionHeader(response) {
  if (response && response.headers) {
    var cioInstanceId = response.headers[CIOInstanceIdHeader.toLowerCase()];
    if (cioInstanceId) {
      setKeyToLocalStore(stickyInstanceIdLocalStoreName, cioInstanceId);
    }
  }
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
