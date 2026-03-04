import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
  clearKeyFromLocalStore,
} from "../utilities/local-storage";
import { getHashedUserToken } from "./user-manager";
import { log } from "../utilities/log";
import type { GistMessage, DisplaySettings } from "../types";

const messageQueueLocalStoreName = "gist.web.message.user";
const messagesLocalStoreCacheInMinutes = 60;

export async function updateQueueLocalStore(
  messages: GistMessage[],
): Promise<void> {
  const userQueueLocalStoreName = await getUserQueueLocalStoreName();
  if (!userQueueLocalStoreName) return;

  const nonBroadcasts = messages.filter(
    (message) =>
      !(
        message.properties &&
        message.properties.gist &&
        (message.properties.gist as { broadcast?: boolean }).broadcast
      ),
  );
  const expiryDate = new Date();
  expiryDate.setMinutes(
    expiryDate.getMinutes() + messagesLocalStoreCacheInMinutes,
  );
  setKeyToLocalStore(userQueueLocalStoreName, nonBroadcasts, expiryDate);
}

export async function getMessagesFromLocalStore(): Promise<GistMessage[]> {
  const userQueueLocalStoreName = await getUserQueueLocalStoreName();
  if (!userQueueLocalStoreName) return [];

  const storedMessages =
    (getKeyFromLocalStore(userQueueLocalStoreName) as GistMessage[] | null) ??
    [];
  const seenMessages = await getSeenMessagesFromLocalStore();
  return storedMessages.filter(
    (message) => !seenMessages.includes(message.queueId ?? ""),
  );
}

export async function markUserQueueMessageAsSeen(
  queueId: string,
): Promise<void> {
  const userSeenQueueLocalStoreName = await getUserSeenQueueLocalStoreName();
  if (!userSeenQueueLocalStoreName) return;

  const seenMessages =
    (getKeyFromLocalStore(userSeenQueueLocalStoreName) as string[] | null) ??
    [];
  seenMessages.push(queueId);
  setKeyToLocalStore(userSeenQueueLocalStoreName, seenMessages);
}

export async function isMessageLoading(queueId: string): Promise<boolean> {
  const messageLoadingLocalStoreName =
    await getMessageLoadingStateLocalStoreName(queueId);
  if (!messageLoadingLocalStoreName) return false;
  return getKeyFromLocalStore(messageLoadingLocalStoreName) !== null;
}

export async function setMessageLoading(queueId: string): Promise<void> {
  const messageLoadingLocalStoreName =
    await getMessageLoadingStateLocalStoreName(queueId);
  if (!messageLoadingLocalStoreName) return;
  setKeyToLocalStore(
    messageLoadingLocalStoreName,
    true,
    new Date(Date.now() + 5000),
  );
}

export async function setMessageLoaded(queueId: string): Promise<void> {
  const messageLoadingLocalStoreName =
    await getMessageLoadingStateLocalStoreName(queueId);
  if (!messageLoadingLocalStoreName) return;
  clearKeyFromLocalStore(messageLoadingLocalStoreName);
}

async function getSeenMessagesFromLocalStore(): Promise<string[]> {
  const userSeenQueueLocalStoreName = await getUserSeenQueueLocalStoreName();
  if (!userSeenQueueLocalStoreName) return [];
  return (
    (getKeyFromLocalStore(userSeenQueueLocalStoreName) as string[] | null) ?? []
  );
}

async function getUserQueueLocalStoreName(): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}`;
}

async function getUserSeenQueueLocalStoreName(): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}.seen`;
}

async function getMessageLoadingStateLocalStoreName(
  queueId: string,
): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}.message.${queueId}.loading`;
}

async function getMessageStateLocalStoreName(
  queueId: string,
): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}.message.${queueId}.state`;
}

export async function saveMessageState(
  queueId: string,
  stepName: string | undefined,
  displaySettings: DisplaySettings | undefined,
): Promise<void> {
  const messageStateLocalStoreName =
    await getMessageStateLocalStoreName(queueId);
  if (!messageStateLocalStoreName) return;

  const existingState = (getKeyFromLocalStore(messageStateLocalStoreName) ||
    {}) as Record<string, unknown>;

  const state = {
    stepName: stepName !== undefined ? stepName : existingState.stepName,
    displaySettings:
      displaySettings !== undefined
        ? displaySettings
        : existingState.displaySettings,
  };

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);
  setKeyToLocalStore(messageStateLocalStoreName, state, expiryDate);
  log(`Saved message state for queueId: ${queueId}`);
}

export async function getSavedMessageState(queueId: string): Promise<unknown> {
  const messageStateLocalStoreName =
    await getMessageStateLocalStoreName(queueId);
  if (!messageStateLocalStoreName) return null;
  return getKeyFromLocalStore(messageStateLocalStoreName);
}

export async function clearMessageState(queueId: string): Promise<void> {
  const messageStateLocalStoreName =
    await getMessageStateLocalStoreName(queueId);
  if (!messageStateLocalStoreName) return;
  clearKeyFromLocalStore(messageStateLocalStoreName);
  log(`Cleared message state for queueId: ${queueId}`);
}
