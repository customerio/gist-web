import { UserNetworkInstance } from './network';
import { setKeyWithExpiryToLocalStore } from '../utilities/local-storage';
import { log } from "../utilities/log";

//const DEFAULT_POLLING_DELAY_IN_SECONDS = 600;
const DEFAULT_POLLING_DELAY_IN_SECONDS = 10;
var currentPollingDelayInSeconds = DEFAULT_POLLING_DELAY_IN_SECONDS;
var checkInProgress = false;

export const userQueueNextPullCheckLocalStoreName = "gist.web.userQueueNextPullCheck";
export async function getUserQueue() {
  var response;
  try {
    if (!checkInProgress) {
      checkInProgress = true;
      response = await UserNetworkInstance().post(`/api/v1/users`, {});
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
  setKeyWithExpiryToLocalStore(userQueueNextPullCheckLocalStoreName, currentPollingDelayInSeconds, expiryDate);
}