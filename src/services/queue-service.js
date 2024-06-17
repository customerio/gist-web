import { UserNetworkInstance, DefaultHeaders } from './network';
import { setKeyToLocalStore } from '../utilities/local-storage';
import { log } from "../utilities/log";
import { isUsingGuestUserToken } from '../managers/user-manager';
import { getUserLocale } from '../managers/locale-manager';

const defaultPollingDelayInSeconds = 600;
var currentPollingDelayInSeconds = defaultPollingDelayInSeconds;
var checkInProgress = false;

export const userQueueNextPullCheckLocalStoreName = "gist.web.userQueueNextPullCheck";
export async function getUserQueue() {
  var response;
  try {
    if (!checkInProgress) {
      var timestamp = new Date().getTime();
      checkInProgress = true;
      var headers = {
        "X-Gist-User-Anonymous": isUsingGuestUserToken(),
        "Content-Language": getUserLocale()
      }
      response = await UserNetworkInstance().post(`/api/v2/users?timestamp=${timestamp}`, {}, { headers: headers });
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
    return response;
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