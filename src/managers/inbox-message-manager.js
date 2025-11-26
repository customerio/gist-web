import Gist from '../gist';
import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';
import { UserNetworkInstance } from '../services/network';
import { log } from '../utilities/log';
import { logUserMessageView } from '../services/log-service';

const inboxMessagesLocalStoreName = "gist.web.inbox.messages";
const inboxMessagesLocalStoreCacheInMinutes = 60;

export async function updateInboxMessagesLocalStore(messages) {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes);

  setKeyToLocalStore(inboxLocalStoreName, messages, expiryDate);

  Gist.events.dispatch('inboxMessages', messages);
}

export async function getInboxMessagesFromLocalStore() {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return [];

  const storedMessages = getKeyFromLocalStore(inboxLocalStoreName) ?? [];
  const now = new Date();

  // Filter out messages that have expired
  return storedMessages.filter(message => {
    if (!message.expiry) return true;
    const expiryDate = new Date(message.expiry);
    return expiryDate > now;
  });
}

export async function getInboxMessagesByTopic(topic) {
  const messages = await getInboxMessagesFromLocalStore();
  if (!topic) return messages;

  return messages.filter(message => {
    if (!message.topics || message.topics.length === 0) {
      return topic === 'default';
    }
    return message.topics.includes(topic);
  });
}

export async function markInboxMessageAsOpened(queueId) {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) {
    throw new Error('User token not available');
  }

  try {
    const response = await UserNetworkInstance()(`/api/v1/messages/${queueId}`, {
      method: 'PATCH',
      body: JSON.stringify({ opened: true }),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to mark message as opened: ${response.status}`);
    }

    log(`Marked inbox message ${queueId} as opened on server:`, response);
  } catch (error) {
    log(`Error marking inbox message ${queueId} as opened:`, error);
    throw error;
  }

  const messages = await getInboxMessagesFromLocalStore();
  const updatedMessages = messages.map(message => {
    if (message.queueId === queueId) {
      return { ...message, opened: true };
    }
    return message;
  });

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes);
  setKeyToLocalStore(inboxLocalStoreName, updatedMessages, expiryDate);

  return true;
}

export async function removeInboxMessage(queueId) {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) {
    throw new Error('User token not available');
  }

  const response = await logUserMessageView(queueId);

  if (!response || response.status < 200 || response.status >= 300) {
    const errorMsg = `Failed to log message view: ${response?.status || 'unknown error'}`;
    log(errorMsg);
    throw new Error(errorMsg);
  }

  const messages = await getInboxMessagesFromLocalStore();
  const filteredMessages = messages.filter(message =>
    message.queueId !== queueId
  );

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes);
  setKeyToLocalStore(inboxLocalStoreName, filteredMessages, expiryDate);

  return true;
}

async function getInboxMessagesLocalStoreName() {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${inboxMessagesLocalStoreName}.${userToken}`;
}
