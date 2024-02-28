import Gist from '../gist';
import { log } from "../utilities/log";
import { getUserToken } from "./user-manager";
import { getUserQueue, userQueueNextPullCheckLocalStoreName } from "../services/queue-service";
import { showMessage, embedMessage, hasMessageBeenShownBefore } from "./message-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { preloadRenderer } from "./message-component-manager";
import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';

const userQueueLocalStoreName = "gist.web.userQueue";
const MESSAGES_LOCAL_STORE_CACHE_IN_MINUTES = 60000 * 60;

var sleep = time => new Promise(resolve => setTimeout(resolve, time))
var poll = (promiseFn, time) => promiseFn().then(sleep(time).then(() => poll(promiseFn, time)));
var pollingSetup = false;
var messages = [];

export async function startQueueListener() {
  if (!pollingSetup) {
    preloadRenderer();
    if (getUserToken()) {
      log("Queue watcher started");
      pollingSetup = true;
      poll(() => new Promise(() => pullMessagesFromQueue()), 1000);
    } else {
      log(`User token not setup, queue not started.`);
    }
  } else {
    await checkMessageQueue();
  }
}

export async function checkMessageQueue() {
  log(`Messages in local queue: ${messages.length}`);
  var keptMessages = [];
  var orderedMessages = messages.sort((a, b) => a.priority - b.priority);
  for (const message of orderedMessages) {
    var handledMessage = await handleMessage(message);
    if (!handledMessage) {
      var duplicateMessage = keptMessages.find(queueMessages => queueMessages.queueId === message.queueId);
      var showingMessage = Gist.currentMessages.find(currentMessage => currentMessage.queueId === message.queueId);
      if (duplicateMessage || showingMessage) {
        log(`Message with queueId: ${message.queueId} already in queue, discarding.`);
      } else {
        keptMessages.push(message);
      }
    }
  }
  messages = keptMessages;
}

async function handleMessage(message) {
  if (hasMessageBeenShownBefore(message)) {
    log(`Message with ${message.queueId} has been shown before, skipping.`);
    return;
  }

  var messageProperties = resolveMessageProperties(message);
  if (messageProperties.hasRouteRule) {
    var currentUrl = Gist.currentRoute
    if (currentUrl == null) {
      currentUrl = new URL(window.location.href).pathname;
    }
    var routeRule = messageProperties.routeRule;
    log(`Verifying route against rule: ${routeRule}`);
    var urlTester = new RegExp(routeRule);
    if (!urlTester.test(currentUrl)) {
      log(`Route ${currentUrl} does not match rule.`);
      return false;
    }
  }
  if (messageProperties.hasPosition) {
    message.position = messageProperties.position;
  }
  if (messageProperties.isEmbedded) {
    return await embedMessage(message, messageProperties.elementId);
  } else {
    return await showMessage(message);
  }
}

export async function pullMessagesFromQueue() {
  if (getUserToken()) {
    if (Gist.isDocumentVisible) {
      // We're using the TTL as a way to determine if we should check the queue, so if the key is not there, we check the queue.
      if (getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName) === null) {
        var response = await getUserQueue();
        var responseData = [];
        if (response) {
          if (response.status === 200 || response.status === 204) {
            log("200 response, updating local store.");
            responseData = response.data;
            updateQueueLocalStore(responseData);
          }
          else if (response.status === 304) {
            log("304 response, using local store.");
            responseData = getMessagesFromLocalStore();
          }
          if (responseData && responseData.length > 0) {
            log(`Message queue checked for user ${getUserToken()}, ${responseData.length} messages found.`);
            messages = responseData;
            await checkMessageQueue();
          } else {
            messages = [];
            log(`No messages for user token.`);
          }
        } else {
          log(`There was an error while checking message queue.`);
        }
      } else {
        log(`Next queue pull scheduled for later`);
      }
    } else {
      log(`Document not visible, skipping queue check.`);  
    }
  } else {
    log(`User token reset, skipping queue check.`);
  }
}

export function updateQueueLocalStore(messages) {
  var expiryDate = new Date(new Date().getTime() + MESSAGES_LOCAL_STORE_CACHE_IN_MINUTES);
  setKeyWithExpiryToLocalStore(userQueueLocalStoreName, messages, expiryDate);
}

export function getMessagesFromLocalStore() {
  return getKeyFromLocalStore(userQueueLocalStoreName);
}