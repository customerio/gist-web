import Gist from '../gist';
import { log } from "../utilities/log";
import { getUserToken } from "./user-manager";
import { getUserQueue, getUserSettings } from "../services/queue-service";
import { showMessage, embedMessage } from "./message-manager";
import { resolveMessageProperies } from "./gist-properties-manager";
import * as Ably from 'ably/promises';

var sleep = time => new Promise(resolve => setTimeout(resolve, time))
var poll = (promiseFn, time) => promiseFn().then(sleep(time).then(() => poll(promiseFn, time)));
var pollingSetup = false;

export async function startQueueListener() {
  if (!pollingSetup) {
    if (getUserToken() !== undefined) {
      log("Queue watcher started");
      pollingSetup = true;
      poll(() => new Promise(() => pollMessageQueue()), 5000);

      if (Gist.config.experiments) {
        var response = await getUserSettings();
        if (response.status === 200) {
          var ably = new Ably.Realtime(response.data.apiKey);
          log(`Listening on channel: ${response.data.userChannel}`)
          var channel = ably.channels.get(response.data.userChannel);
          channel.subscribe('queue', function(message) {
            handleMessage(message.data);
          });
        }
      }

    } else {
      log(`User token not setup, queue not started.`);
    }
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