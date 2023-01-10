import Gist from '../gist';
import { log } from "../utilities/log";
import ReconnectingEventSource from '../utilities/reconnecting-eventsource';
import { getUserToken, isUsingGuestUserToken } from "./user-manager";
import { getUserQueue, getUserSettings, cancelPendingGetUserSettingsRequests } from "../services/queue-service";
import { showMessage, embedMessage } from "./message-manager";
import { resolveMessageProperies } from "./gist-properties-manager";
import { preloadRenderer } from "./message-component-manager";

var sleep = time => new Promise(resolve => setTimeout(resolve, time))
var poll = (promiseFn, time) => promiseFn().then(sleep(time).then(() => poll(promiseFn, time)));
var pollingSetup = false;
var eventSource = null;
var messages = [];

export async function startQueueListener() {
  if (!pollingSetup) {
    preloadRenderer();
    if (getUserToken()) {
      log("Queue watcher started");
      pollingSetup = true;
      poll(() => new Promise(() => pollMessageQueue()), 60000);
    } else {
      log(`User token not setup, queue not started.`);
    }
  } else {
    checkMessageQueue();
  }

  if (isUsingGuestUserToken()) {
    // Closing SSE connection when token is cleared and Guest session is active
    resetSSEConnection();
  } else {
    await startSSEListener();
  }
}

export function checkMessageQueue() {
  log(`Messages in local queue: ${messages.length}`);
  var keptMessages = [];
  messages.forEach(message => {
    if (!handleMessage(message)) {
      var duplicateMessage = keptMessages.find(queueMessages => queueMessages.queueId === message.queueId);
      var showingMessage = Gist.currentMessages.find(currentMessage => currentMessage.queueId === message.queueId);
      if (duplicateMessage || showingMessage) {
        log(`Message with queueId: ${message.queueId} already in queue, discarding.`);
      } else {
        keptMessages.push(message);
      }
    }
  });
  messages = keptMessages;
}

async function startSSEListener() {
  resetSSEConnection();
  if (getUserToken()) {
    var response = await getUserSettings();
    if (response != undefined && response.status === 200) {
      log(`Listening to SSE on endpoint: ${response.data.sseEndpoint}`);
      eventSource = new ReconnectingEventSource(response.data.sseEndpoint);
      eventSource.onmessage = function(event) {
        var message = JSON.parse(event.data);
        if (message.name === "queue") {
          var queueMessage = JSON.parse(message.data);
          messages.push(queueMessage);
          checkMessageQueue();
        }
      };
    }
  } else {
    eventSource = null;
  }
}

function resetSSEConnection() {
  cancelPendingGetUserSettingsRequests();
  if (eventSource != null) {
    log("Closing EventSource connection");
    eventSource.close();
  }
}

function handleMessage(message) {
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
    return embedMessage(message, messageProperties.elementId);
  } else {
    return showMessage(message);
  }
}

export async function pollMessageQueue() {
  if (getUserToken()) {
    var response = await getUserQueue();
    if (response != undefined && (response.status === 200 || response.status === 204)) {
      log(`Message queue checked for user ${getUserToken()}, ${response.data.length} messages found.`);
      if (response.data.length > 0) {
        messages = response.data;
        checkMessageQueue();
      } else {
        log(`No messages for user token.`);    
      }
    } else {
      log(`There was an error while checking message queue: ${response.status}`);
    }
  } else {
    log(`User token reset, skipping queue check.`);
  }
}