import { getKeyFromLocalStore, setKeyToLocalStore, clearKeyFromLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';
import { log } from '../utilities/log';

const messageQueueLocalStoreName = "gist.web.message.user";
const messagesLocalStoreCacheInMinutes = 60000 * 60;


export async function updateQueueLocalStore(messages) {
  const userQueueLocalStoreName = await getUserQueueLocalStoreName();
  if (!userQueueLocalStoreName) return;

  const nonBroadcasts = messages.filter(message => 
    !(message.properties && message.properties.gist && message.properties.gist.broadcast)
  );
  const expiryDate = new Date(Date.now() + messagesLocalStoreCacheInMinutes);
  setKeyToLocalStore(userQueueLocalStoreName, nonBroadcasts, expiryDate);
}

export async function getMessagesFromLocalStore() {
  const userQueueLocalStoreName = await getUserQueueLocalStoreName();
  if (!userQueueLocalStoreName) return [];

  const storedMessages = getKeyFromLocalStore(userQueueLocalStoreName) ?? [];
  const seenMessages = await getSeenMessagesFromLocalStore();
  return storedMessages.filter(message => !seenMessages.includes(message.queueId));
}

export async function markUserQueueMessageAsSeen(queueId) {
  const userSeenQueueLocalStoreName = await getUserSeenQueueLocalStoreName();
  if (!userSeenQueueLocalStoreName) return;

  const seenMessages = getKeyFromLocalStore(userSeenQueueLocalStoreName) ?? [];
  seenMessages.push(queueId);
  setKeyToLocalStore(userSeenQueueLocalStoreName, seenMessages);
}

export async function isMessageLoading(queueId) {
  const messageLoadingLocalStoreName = await getMessageLoadingStateLocalStoreName(queueId);
  if (!messageLoadingLocalStoreName) return false;
  return getKeyFromLocalStore(messageLoadingLocalStoreName) !== null ? true : false;
}

export async function setMessageLoading(queueId) {
  const messageLoadingLocalStoreName = await getMessageLoadingStateLocalStoreName(queueId);
  if (!messageLoadingLocalStoreName) return false;
  // We add a TTL of 5sec, just in case the message gets stuck loading.
  setKeyToLocalStore(messageLoadingLocalStoreName, true, new Date(Date.now() + 5000));
}

export async function setMessageLoaded(queueId) {
  const messageLoadingLocalStoreName = await getMessageLoadingStateLocalStoreName(queueId);
  log(messageLoadingLocalStoreName);
  if (!messageLoadingLocalStoreName) return false;
  clearKeyFromLocalStore(messageLoadingLocalStoreName);
}

async function getSeenMessagesFromLocalStore() {
  const userSeenQueueLocalStoreName = await getUserSeenQueueLocalStoreName();
  if (!userSeenQueueLocalStoreName) return [];
  
  return getKeyFromLocalStore(userSeenQueueLocalStoreName) ?? [];
}

async function getUserQueueLocalStoreName() {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}`;
}

async function getUserSeenQueueLocalStoreName() {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}.seen`;
}

async function getMessageLoadingStateLocalStoreName(queueId) {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${messageQueueLocalStoreName}.${userToken}.message.${queueId}.loading`
}