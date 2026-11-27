import Gist from '../gist';
import { UserNetworkInstance } from './network';
import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
  clearKeyFromLocalStore,
} from '../utilities/local-storage';
import { log } from '../utilities/log';
import {
  isUsingGuestUserToken,
  getEncodedUserToken,
  getUserToken,
  getUserJwt,
} from '../managers/user-manager';
import {
  getRequestIdentity,
  handleUserJwtRejection,
  markQueueFetchSent,
  markQueueFetchSucceeded,
} from '../managers/user-jwt-manager';
import { getUserLocale } from '../managers/locale-manager';
import { processInboxConfig } from '../managers/inbox-config-manager';
import { settings } from './settings';
import { v4 as uuidv4 } from 'uuid';
import { getNetworkErrorResponse } from './network';
import type { NetworkResponse } from './network';

const defaultPollingDelayInSeconds = 600;
const sessionExpiryMs = 30 * 60 * 1000;
const msPerSecond = 1000;

let currentPollingDelayInSeconds = defaultPollingDelayInSeconds;
let checkInProgress = false;

export const userQueueNextPullCheckLocalStoreName = 'gist.web.userQueueNextPullCheck';
export const sessionIdLocalStoreName = 'gist.web.sessionId';

export async function getUserQueue(): Promise<NetworkResponse | undefined> {
  if (checkInProgress) return;
  checkInProgress = true;

  const sentWith = getRequestIdentity();
  markQueueFetchSent();
  let response: NetworkResponse | undefined;
  try {
    const headers: Record<string, string> = {
      'X-Gist-User-Anonymous': String(isUsingGuestUserToken()),
      'Content-Language': String(getUserLocale()),
    };
    response = await UserNetworkInstance().post(
      `/api/v4/users?sessionId=${getSessionId()}`,
      {},
      { headers }
    );
  } catch (error) {
    const errorResponse = getNetworkErrorResponse(error);
    if (errorResponse) {
      response = errorResponse;
    } else {
      log(`Error getting user queue: ${error}`);
    }
  } finally {
    checkInProgress = false;
  }

  if (sentWith.userToken !== getUserToken()) {
    log('User token changed, clearing queue next pull check.');
    clearKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    return;
  }

  // The JWT changed while the fetch was out, and the user token is the same
  // (checked above). Gist marks what a 200 carries as read for this browser and
  // answers later fetches 304, so a successful answer is the only copy of it:
  // keep it. A rejection or an error says nothing about the current JWT: no
  // event, pause or schedule. A fetch setUserJwt asked for stays requested, and
  // goes when isQueueFetchDue next allows it.
  if (sentWith.userJwt !== getUserJwt()) {
    if (!isSuccessful(response)) {
      log('User JWT changed during the queue fetch, discarding its response.');
      return;
    }
    log('User JWT changed during the queue fetch, keeping its response for the same user.');
  }

  // A rejection pauses this tab alone, so it leaves the schedule every tab shares.
  if (!handleUserJwtRejection(response, sentWith)) {
    scheduleNextQueuePull(response);
  }
  if (isSuccessful(response)) {
    markQueueFetchSucceeded();
  }
  setQueueUseSSE(response);
  await processInboxConfig(response);
  return response;
}

function isSuccessful(response?: NetworkResponse): boolean {
  return response !== undefined && response.status >= 200 && response.status < 400;
}

function setQueueUseSSE(response?: NetworkResponse): void {
  const useSSE = response?.headers?.['x-cio-use-sse']?.toLowerCase() === 'true';
  settings.setUseSSEFlag(useSSE);
}

function getSessionId(): string {
  let sessionId = getKeyFromLocalStore(sessionIdLocalStoreName) as string | null;
  if (!sessionId) {
    sessionId = uuidv4();
  }
  setKeyToLocalStore(
    sessionIdLocalStoreName,
    sessionId,
    new Date(new Date().getTime() + sessionExpiryMs)
  );
  return String(sessionId);
}

function scheduleNextQueuePull(response?: NetworkResponse): void {
  const pollingInterval = response?.headers?.['x-gist-queue-polling-interval'];
  if (pollingInterval && Number(pollingInterval) > 0) {
    currentPollingDelayInSeconds = Number(pollingInterval);
  } else {
    currentPollingDelayInSeconds = Math.min(
      currentPollingDelayInSeconds * 2,
      defaultPollingDelayInSeconds
    );
  }
  const expiryDate = new Date(new Date().getTime() + currentPollingDelayInSeconds * msPerSecond);
  setKeyToLocalStore(
    userQueueNextPullCheckLocalStoreName,
    currentPollingDelayInSeconds,
    expiryDate
  );
}

export function getQueueSSEEndpoint(): string | null {
  const encodedUserToken = getEncodedUserToken();
  if (encodedUserToken === null) {
    log('No user token available for SSE endpoint.');
    return null;
  }
  return (
    settings.GIST_QUEUE_REALTIME_API_ENDPOINT[Gist.config.env ?? 'prod'] +
    `/api/v3/sse?userToken=${encodedUserToken}&siteId=${Gist.config.siteId}&sessionId=${getSessionId()}&platform=web`
  );
}

export function getPollingIntervalSeconds(): number {
  return currentPollingDelayInSeconds;
}
