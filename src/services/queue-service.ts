import Gist from "../gist";
import { UserNetworkInstance } from "./network";
import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
  clearKeyFromLocalStore,
} from "../utilities/local-storage";
import { log } from "../utilities/log";
import {
  isUsingGuestUserToken,
  getEncodedUserToken,
  getUserToken,
} from "../managers/user-manager";
import { getUserLocale } from "../managers/locale-manager";
import { settings } from "./settings";
import { v4 as uuidv4 } from "uuid";
import type { NetworkResponse } from "./network";

const defaultPollingDelayInSeconds = 600;
let currentPollingDelayInSeconds = defaultPollingDelayInSeconds;
let checkInProgress = false;

export const userQueueNextPullCheckLocalStoreName =
  "gist.web.userQueueNextPullCheck";
export const sessionIdLocalStoreName = "gist.web.sessionId";

export async function getUserQueue(): Promise<
  NetworkResponse | undefined
> {
  const existingUserToken = getUserToken();
  let response: NetworkResponse | undefined;
  try {
    if (!checkInProgress) {
      checkInProgress = true;
      const headers: Record<string, string> = {
        "X-Gist-User-Anonymous": String(isUsingGuestUserToken()),
        "Content-Language": String(getUserLocale()),
      };
      response = await UserNetworkInstance().post(
        `/api/v4/users?sessionId=${getSessionId()}`,
        {},
        { headers },
      );
    }
  } catch (error) {
    if ((error as { response?: NetworkResponse }).response) {
      response = (error as { response: NetworkResponse }).response;
    } else {
      log(`Error getting user queue: ${error}`);
    }
  } finally {
    checkInProgress = false;
  }

  if (existingUserToken !== getUserToken()) {
    log("User token changed, clearing queue next pull check.");
    clearKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    return;
  }

  scheduleNextQueuePull(response);
  setQueueUseSSE(response);
  return response;
}

function setQueueUseSSE(response?: NetworkResponse): void {
  const useSSE =
    response?.headers?.["x-cio-use-sse"]?.toLowerCase() === "true";
  settings.setUseSSEFlag(useSSE);
}

function getSessionId(): string {
  let sessionId = getKeyFromLocalStore(sessionIdLocalStoreName) as
    | string
    | null;
  if (!sessionId) {
    sessionId = uuidv4();
  }
  setKeyToLocalStore(
    sessionIdLocalStoreName,
    sessionId,
    new Date(new Date().getTime() + 1800000),
  );
  return String(sessionId);
}

function scheduleNextQueuePull(response?: NetworkResponse): void {
  if (response?.headers) {
    const pollingInterval = response.headers["x-gist-queue-polling-interval"];
    if (pollingInterval && Number(pollingInterval) > 0) {
      currentPollingDelayInSeconds = Number(pollingInterval);
    }
  }
  const expiryDate = new Date(
    new Date().getTime() + currentPollingDelayInSeconds * 1000,
  );
  setKeyToLocalStore(
    userQueueNextPullCheckLocalStoreName,
    currentPollingDelayInSeconds,
    expiryDate,
  );
}

export function getQueueSSEEndpoint(): string | null {
  const encodedUserToken = getEncodedUserToken();
  if (encodedUserToken === null) {
    log("No user token available for SSE endpoint.");
    return null;
  }
  return (
    settings.GIST_QUEUE_REALTIME_API_ENDPOINT[Gist.config.env ?? "prod"] +
    `/api/v3/sse?userToken=${encodedUserToken}&siteId=${Gist.config.siteId}&sessionId=${getSessionId()}`
  );
}
