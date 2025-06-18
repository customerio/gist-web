import Gist from '../gist';
import { log } from "../utilities/log";
import { getUserToken, isAnonymousUser } from "./user-manager";
import { getUserQueue, getQueueSSEEndpoint, userQueueNextPullCheckLocalStoreName } from "../services/queue-service";
import { showMessage, embedMessage } from "./message-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { clearKeyFromLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import { updateBroadcastsLocalStore, getEligibleBroadcasts, isShowAlwaysBroadcast } from './message-broadcast-manager';
import { updateQueueLocalStore, getMessagesFromLocalStore, isMessageLoading, setMessageLoading } from './message-user-queue-manager';
import { settings } from '../services/settings';

var sleep = time => new Promise(resolve => setTimeout(resolve, time))
var poll = (promiseFn, time) => promiseFn().then(sleep(time).then(() => poll(promiseFn, time)));
var pollingSetup = false;
let sseSource = null;

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
    await checkMessageQueue();
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
    var currentUrl = Gist.currentRoute;
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

  // If the message is not persistant, is not a show always broadcast, and is already loading, we skip it.
  if (!messageProperties.persistent && !isShowAlwaysBroadcast(message) && await isMessageLoading(message.queueId)) {
    log(`Not showing message with queueId ${message.queueId} because its already loading.`);
    return false;
  } else {
    var loading = false;
    if (messageProperties.isEmbedded) {
      loading = await embedMessage(message, messageProperties.elementId);
    } else {
      loading = await showMessage(message);
    }
    if (loading) setMessageLoading(message.queueId);
    return loading;
  }
}

export async function pullMessagesFromQueue() {
  // If SSE connection is already active, just check the local queue
  if (settings.hasActiveSSEConnection()) {
    await checkMessageQueue();
    return;
  }

  // If SSE is enabled and user is not anonymous, set up SSE listener
  if (settings.useSSE() && !isAnonymousUser()) {
    await setupSSEQueueListener();
    return;
  }

  // Fall back to polling
  await checkQueueThroughPolling();
}

async function checkQueueThroughPolling() {
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
          } else if (response.status === 304) {
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

async function setupSSEQueueListener() {
  const sseURL = getQueueSSEEndpoint();
  if (sseURL === null) {
    log("SSE endpoint not available, falling back to polling.");
    await checkQueueThroughPolling();
    return;
  }
  log(`Starting SSE queue listener on ${sseURL}`);
  sseSource = new EventSource(sseURL);
  settings.setActiveSSEConnection();

  sseSource.addEventListener("connected", async (event) => {
    log("SSE connection received:", event);
    settings.setActiveSSEConnection();
    settings.setUseSSEFlag(true);
    // On successful SSE connection, pull the queue.
    clearKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    await checkQueueThroughPolling();
  });

  sseSource.addEventListener("messages", async (event) => {
    try {
      var messages = JSON.parse(event.data);
      log("SSE message received:", messages);
      await updateQueueLocalStore(messages);
      await updateBroadcastsLocalStore(messages);
      await checkMessageQueue();
    } catch (e) {
      log("Failed to parse SSE message", e);
      stopSSEListener();
    }
  });

  sseSource.addEventListener("error", async (event) => {
    log("SSE error received:", event);
    stopSSEListener();
  });

  sseSource.addEventListener("heartbeat", async (event) => {
    log("SSE heartbeat received:", event);
    settings.setActiveSSEConnection();
    settings.setUseSSEFlag(true);
  });
}

export function stopSSEListener() {
  // No active SSE connection to stop
  if (!sseSource) {
    return;
  }

  // Close the connection and clean up
  log("Stopping SSE queue listener...");
  sseSource.close();
  sseSource = null;
  
  // Update settings to reflect disconnected state
  settings.setUseSSEFlag(false);
}
