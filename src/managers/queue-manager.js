import Gist from '../gist';
import { log } from "../utilities/log";
import { getUserToken } from "./user-manager";
import { getUserQueue, getUserSettings, cancelPendingGetUserSettingsRequests } from "../services/queue-service";
import { showMessage, embedMessage } from "./message-manager";
import { resolveMessageProperies } from "./gist-properties-manager";
import { preloadRenderer } from "./message-component-manager";

var sleep = time => new Promise(resolve => setTimeout(resolve, time))
var poll = (promiseFn, time) => promiseFn().then(sleep(time).then(() => poll(promiseFn, time)));
var pollingSetup = false;
var eventSource = null;

export async function startQueueListener() {
  if (!pollingSetup) {
    preloadRenderer();
    if (getUserToken() !== undefined) {
      log("Queue watcher started");
      pollingSetup = true;
      poll(() => new Promise(() => pollMessageQueue()), 60000);
    } else {
      log(`User token not setup, queue not started.`);
    }
  } else {
    await checkMessageQueue();
  }
  await startSSEListener();
}

export async function checkMessageQueue() {
  await pollMessageQueue();
}

async function startSSEListener() {
  resetSSEConnection();
  if (getUserToken() !== undefined) {
    var response = await getUserSettings();
    if (response != undefined && response.status === 200) {
      log(`Listening to SSE on endpoint: ${response.data.sseEndpoint}`);
      eventSource = new EventSource(response.data.sseEndpoint);
      eventSource.onmessage = function(event) {
        var message = JSON.parse(event.data);
        if (message.name === "queue") {
          var queueMessage = JSON.parse(message.data);
          handleMessage(queueMessage);
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
      return;
    }
  }
  if (messageProperties.hasPosition) {
    message.position = messageProperties.position;
  }
  if (messageProperties.isEmbedded) {
    embedMessage(message, messageProperties.elementId);
  } else {
    showMessage(message);
  }
}

async function pollMessageQueue() {
  if (getUserToken() !== undefined) {
    var response = await getUserQueue(Gist.topics);
    if (response.status === 200 || response.status === 204) {
      log(`Message queue checked for user ${getUserToken()}, ${response.data.length} messages found.`);
      if (response.data.length > 0) {
        response.data.forEach(message => {
          handleMessage(message);
        });
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