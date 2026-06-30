import Gist from '../gist';
import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { getHashedUserToken } from './user-manager';
import { log } from '../utilities/log';
import { logUserMessageView } from '../services/log-service';
import { updateMessage } from '../services/message-service';
import type { MessageProperties } from '../types';

export interface InboxMessage {
  messageId: string;
  queueId?: string;
  opened?: boolean;
  expiry?: string;
  priority?: number;
  sentAt?: string;
  topics?: string[];
  properties?: MessageProperties;
  [key: string]: unknown;
}

const messageInboxUpdatedEventName = 'messageInboxUpdated';
const inboxMessageEventName = 'inboxMessageAction';
const inboxMessageReceivedEventName = 'inboxMessageReceived';
const inboxMessagesLocalStoreName = 'gist.web.inbox.messages';
const inboxMessagesLocalStoreCacheInMinutes = 60;

export async function updateInboxMessagesLocalStore(messages: InboxMessage[]): Promise<void> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  // Dedup against the raw stored queueIds (not the expiry-filtered view) so an
  // already-received message that has since expired is not re-emitted as "received".
  const storedMessages = (getKeyFromLocalStore(inboxLocalStoreName) as InboxMessage[] | null) ?? [];
  const existingQueueIds = new Set(storedMessages.map((message) => message.queueId));

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes);

  setKeyToLocalStore(inboxLocalStoreName, messages, expiryDate);

  for (const message of messages) {
    if (message.queueId && !existingQueueIds.has(message.queueId)) {
      Gist.events.dispatch(inboxMessageReceivedEventName, { message });
    }
  }

  Gist.events.dispatch(messageInboxUpdatedEventName, messages);
}

export async function getInboxMessagesFromLocalStore(): Promise<InboxMessage[]> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return [];

  const storedMessages = (getKeyFromLocalStore(inboxLocalStoreName) as InboxMessage[] | null) ?? [];
  const now = new Date();

  return storedMessages.filter((message) => {
    if (!message.expiry) return true;
    const expiryDate = new Date(message.expiry);
    return expiryDate > now;
  });
}

export async function getInboxMessagesByTopic(topic: string | null): Promise<InboxMessage[]> {
  const messages = await getInboxMessagesFromLocalStore();
  if (!topic) return messages;

  return messages.filter((message) => {
    if (!message.topics || message.topics.length === 0) {
      return topic === 'default';
    }
    return message.topics.includes(topic);
  });
}

export async function updateInboxMessageOpenState(queueId: string, opened: boolean): Promise<void> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  const response = await updateMessage(queueId, { opened });

  if (!response || response.status < 200 || response.status >= 300) {
    const errorMsg = `Failed to mark inbox message opened: ${response?.status ?? 'unknown error'}`;
    log(errorMsg);
    throw new Error(errorMsg);
  }

  const messages = await getInboxMessagesFromLocalStore();
  let updatedMessage: InboxMessage | null = null;
  const updatedMessages = messages.map((message) => {
    if (message.queueId === queueId) {
      const updated = { ...message, opened };
      updatedMessage = updated;
      return updated;
    }
    return message;
  });

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes);
  setKeyToLocalStore(inboxLocalStoreName, updatedMessages, expiryDate);

  if (updatedMessage) {
    const action = opened ? 'opened' : 'unopened';
    Gist.events.dispatch(inboxMessageEventName, {
      message: updatedMessage,
      action,
    });
  }

  Gist.events.dispatch(messageInboxUpdatedEventName, await getInboxMessagesFromLocalStore());
}

export async function removeInboxMessage(queueId: string): Promise<void> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  const messages = await getInboxMessagesFromLocalStore();
  const removedMessage = messages.find((message) => message.queueId === queueId) ?? null;
  const filteredMessages = messages.filter((message) => message.queueId !== queueId);

  const expiryDate = new Date();
  expiryDate.setMinutes(expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes);
  setKeyToLocalStore(inboxLocalStoreName, filteredMessages, expiryDate);

  if (removedMessage) {
    Gist.events.dispatch(inboxMessageEventName, {
      message: removedMessage,
      action: 'dismissed',
    });
  }

  Gist.events.dispatch(messageInboxUpdatedEventName, await getInboxMessagesFromLocalStore());

  const response = await logUserMessageView(queueId);
  if (!response || response.status < 200 || response.status >= 300) {
    log(`Failed to log inbox message view: ${response?.status ?? 'unknown error'}`);
  }
}

async function getInboxMessagesLocalStoreName(): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${inboxMessagesLocalStoreName}.${userToken}`;
}
