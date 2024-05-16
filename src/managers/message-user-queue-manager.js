import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';

const messageQueueLocalStoreName = "gist.web.message.user";
const MESSAGES_LOCAL_STORE_CACHE_IN_MINUTES = 60000 * 60;

export async function updateQueueLocalStore(messages) {
  const userQueueLocalStoreName = await getUserQueueLocalStoreName();
  if (!userQueueLocalStoreName) return;

  const nonBroadcasts = messages.filter(message => 
    !(message.properties && message.properties.gist && message.properties.gist.broadcast)
  );
  const expiryDate = new Date(Date.now() + MESSAGES_LOCAL_STORE_CACHE_IN_MINUTES);
  setKeyWithExpiryToLocalStore(userQueueLocalStoreName, nonBroadcasts, expiryDate);
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