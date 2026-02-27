import Gist from "../gist";
import {
  getKeyFromLocalStore,
  setKeyToLocalStore,
} from "../utilities/local-storage";
import { getHashedUserToken } from "./user-manager";
import { log } from "../utilities/log";
import { logUserMessageView } from "../services/log-service";
import { updateMessage } from "../services/message-service";
import type { MessageProperties } from "../types";

export interface InboxMessage {
  messageId: string;
  queueId?: string;
  opened?: boolean;
  expiry?: string;
  topics?: string[];
  properties?: MessageProperties;
  [key: string]: unknown;
}

const messageInboxUpdatedEventName = "messageInboxUpdated";
const inboxMessageEventName = "inboxMessageAction";
const inboxMessagesLocalStoreName = "gist.web.inbox.messages";
const inboxMessagesLocalStoreCacheInMinutes = 60;

export async function updateInboxMessagesLocalStore(
  messages: InboxMessage[],
): Promise<void> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  const expiryDate = new Date();
  expiryDate.setMinutes(
    expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes,
  );

  setKeyToLocalStore(inboxLocalStoreName, messages, expiryDate);

  Gist.events.dispatch(messageInboxUpdatedEventName, messages);
}

export async function getInboxMessagesFromLocalStore(): Promise<InboxMessage[]> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return [];

  const storedMessages =
    (getKeyFromLocalStore(inboxLocalStoreName) as InboxMessage[] | null) ?? [];
  const now = new Date();

  return storedMessages.filter((message) => {
    if (!message.expiry) return true;
    const expiryDate = new Date(message.expiry);
    return expiryDate > now;
  });
}

export async function getInboxMessagesByTopic(
  topic: string | null,
): Promise<InboxMessage[]> {
  const messages = await getInboxMessagesFromLocalStore();
  if (!topic) return messages;

  return messages.filter((message) => {
    if (!message.topics || message.topics.length === 0) {
      return topic === "default";
    }
    return message.topics.includes(topic);
  });
}

export async function updateInboxMessageOpenState(
  queueId: string,
  opened: boolean,
): Promise<void> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  const response = await updateMessage(queueId, { opened });

  if (!response || response.status < 200 || response.status >= 300) {
    const errorMsg = `Failed to mark inbox message opened: ${response?.status ?? "unknown error"}`;
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
  expiryDate.setMinutes(
    expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes,
  );
  setKeyToLocalStore(inboxLocalStoreName, updatedMessages, expiryDate);

  if (updatedMessage) {
    const action = opened ? "opened" : "unopened";
    Gist.events.dispatch(inboxMessageEventName, {
      message: updatedMessage,
      action,
    });
  }

  Gist.events.dispatch(
    messageInboxUpdatedEventName,
    await getInboxMessagesFromLocalStore(),
  );
}

export async function removeInboxMessage(queueId: string): Promise<void> {
  const inboxLocalStoreName = await getInboxMessagesLocalStoreName();
  if (!inboxLocalStoreName) return;

  const response = await logUserMessageView(queueId);

  if (!response || response.status < 200 || response.status >= 300) {
    const errorMsg = `Failed to remove inbox message: ${response?.status ?? "unknown error"}`;
    log(errorMsg);
    throw new Error(errorMsg);
  }

  const messages = await getInboxMessagesFromLocalStore();
  const filteredMessages = messages.filter(
    (message) => message.queueId !== queueId,
  );

  const expiryDate = new Date();
  expiryDate.setMinutes(
    expiryDate.getMinutes() + inboxMessagesLocalStoreCacheInMinutes,
  );
  setKeyToLocalStore(inboxLocalStoreName, filteredMessages, expiryDate);

  Gist.events.dispatch(
    messageInboxUpdatedEventName,
    await getInboxMessagesFromLocalStore(),
  );
}

async function getInboxMessagesLocalStoreName(): Promise<string | null> {
  const userToken = await getHashedUserToken();
  if (!userToken) return null;
  return `${inboxMessagesLocalStoreName}.${userToken}`;
}
