import Gist from '../gist';
import { log } from "../utilities/log";
import { getUserToken } from "./user-manager";
import { getUserQueue } from "../services/queue-service";
import { showMessage, embedMessage } from "./message-manager";
import { resolveMessageProperies } from "./gist-properties-manager";
import { preloadRenderer } from "./message-component-manager";
import { setKeyWithExpiryToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';

const userQueueLocalStoreName = "gist.web.userQueue";
const POLLING_DELAY_IN_SECONDS = 1000 * 10;
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
      poll(() => new Promise(() => pollMessageQueue()), POLLING_DELAY_IN_SECONDS);
    } else {
      log(`User token not setup, queue not started.`);
    }
  } else {
    checkMessageQueue();
  }
}

export async function checkMessageQueue() {
  log(`Messages in local queue: ${messages.length}`);
  var keptMessages = [];

  for (const message of messages) {
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
  var messageProperties = resolveMessageProperies(message);
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

export async function pollMessageQueue() {
  if (getUserToken()) {
    if (Gist.isDocumentVisible) {
      var response = await getUserQueue();
      var responseData = [];
      if (response) {
        if (response.status === 200 || response.status === 204) {
          var expiryDate = new Date(new Date().getTime() + 1 * 60000);
          setKeyWithExpiryToLocalStore(userQueueLocalStoreName, response.data, expiryDate);
          responseData = response.data;
        }
        else if (response.status === 304) {
          responseData = getKeyFromLocalStore(userQueueLocalStoreName);
        }
        if (responseData && responseData.length > 0) {
          log(`Message queue checked for user ${getUserToken()}, ${responseData.length} messages found.`);
          messages = responseData;
          checkMessageQueue();
        } else {
          messages = [];
          log(`No messages for user token.`);
        }
      } else {
        log(`There was an error while checking message queue.`);
      }
    } else {
      log(`Document not visible, skipping queue check.`);  
    }
  } else {
    log(`User token reset, skipping queue check.`);
  }
}