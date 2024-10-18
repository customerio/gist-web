import Gist from '../gist';
import { log } from "../utilities/log";
import { getUserToken } from "./user-manager";
import { getUserQueue, userQueueNextPullCheckLocalStoreName } from "../services/queue-service";
import { showMessage, embedMessage } from "./message-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { getKeyFromLocalStore } from '../utilities/local-storage';
import { updateBroadcastsLocalStore, getEligibleBroadcasts } from './message-broadcast-manager';
import { updateQueueLocalStore, getMessagesFromLocalStore } from './message-user-queue-manager';

var sleep = time => new Promise(resolve => setTimeout(resolve, time))
var poll = (promiseFn, time) => promiseFn().then(sleep(time).then(() => poll(promiseFn, time)));
var pollingSetup = false;

export async function startQueueListener() {
  if (!pollingSetup) {
    if (getUserToken()) {
      log("Queue watcher started");
      pollingSetup = true;
      poll(() => new Promise(() => pullMessagesFromQueue()), 1000);
    } else {
      log("User token not setup, queue not started.");
    }
  } else {
    checkMessageQueue();
  }
}

export async function checkMessageQueue() {
  var broadcastMessages = await getEligibleBroadcasts();
  var userMessages = await getMessagesFromLocalStore();
  var allMessages = broadcastMessages.concat(userMessages);

  log(`Messages in local queue: ${allMessages.length}`);
  var orderedMessages = allMessages.sort((a, b) => a.priority - b.priority);
  for (const message of orderedMessages) {
    await handleMessage(message);
  }
}

//TODO: Move this to a utility and only return valid messages (from: getEligibleBroadcasts getMessagesFromLocalStore) & to handleMessage
async function handleMessage(message) {
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
            updateBroadcastsLocalStore(responseData);
          }
          else if (response.status === 304) {
            log("304 response, using local store.");
          }
          await checkMessageQueue();
        } else {
          log(`There was an error while checking message queue.`);
        }
      } else {
        log(`Next queue pull scheduled for later.`);
      }
    } else {
      log(`Document not visible, skipping queue check.`);  
    }
  } else {
    log(`User token reset, skipping queue check.`);
  }
}