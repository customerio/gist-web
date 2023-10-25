import Gist from '../gist';
import { log } from "../utilities/log";
import { logMessageView, logUserMessageView } from "../services/log-service";
import { v4 as uuidv4 } from 'uuid';
import { settings } from "../services/settings";
import { 
  loadOverlayComponent, 
  showOverlayComponent, 
  hideOverlayComponent, 
  removeOverlayComponent, 
  loadEmbedComponent, 
  showEmbedComponent, 
  hideEmbedComponent,
  resizeComponent,
  elementHasHeight,
  isElementLoaded
} from "./message-component-manager";
import { resolveMessageProperies } from "./gist-properties-manager";
import { positions, addPageElement } from "./page-component-manager";
import { checkMessageQueue } from "./queue-manager";

var shownMessages = [];

export async function showMessage(message) {
  if (Gist.isDocumentVisible) {
    if (Gist.overlayInstanceId) {
      log(`Message ${Gist.overlayInstanceId} already showing.`);
      return null;
    } else {
      var properties = resolveMessageProperies(message)
      message.instanceId = uuidv4();
      message.overlay = true;
      message.firstLoad = true;
      message.shouldResizeHeight = true;
      message.shouldScale = properties.shouldScale;
      message.renderStartTime = new Date().getTime();
      Gist.overlayInstanceId = message.instanceId;
      Gist.currentMessages.push(message);

      return loadMessageComponent(message);
    }
  } else {
    log("Document hidden, not showing message now.");
    return null;
  }
}

export async function embedMessage(message, elementId) {
  if (Gist.isDocumentVisible) {
    message.instanceId = uuidv4();
    message.overlay = false;
    message.firstLoad = true;
    message.shouldScale = false;
    message.elementId = elementId;
    message.shouldResizeHeight = !elementHasHeight(elementId);
    message.renderStartTime = new Date().getTime();
    Gist.currentMessages.push(message);

    return loadMessageComponent(message, elementId);
  } else {
    log("Document hidden, not showing message now.");
    return null;
  }
}

export async function hideMessage(message) {
  if (message) {
    Gist.messageDismissed(message);

    if (message.overlay) {
      await resetOverlayState(true, message);
    } else {
      resetEmbedState(message);
    }
  } else {
    log(`Message with instance id: ${instanceId} not found`);
  }
}

export async function removePersistentMessage(message) {
  var messageProperties = resolveMessageProperies(message);
  if (message) {
    if (messageProperties.persistent) {
      log(`Persistent message dismissed, logging view`);
      await reportMessageView(message);
    }
  } else {
    log(`Message with instance id: ${instanceId} not found`);
  }
}

function resetEmbedState(message) {
  removeMessageByInstanceId(message.instanceId);
  hideEmbedComponent(message.elementId);
}

async function resetOverlayState(hideFirst, message) {
  removeMessageByInstanceId(message.instanceId);
  Gist.overlayInstanceId = null;
  if (hideFirst) {
    await hideOverlayComponent();
  } else {
    removeOverlayComponent();
  }

  if (Gist.currentMessages.length == 0) {
    window.removeEventListener('message', handleGistEvents);
    window.removeEventListener('touchstart', handleTouchStartEvents);
  }
}

function loadMessageComponent(message, elementId = null) {
  if (elementId && isElementLoaded(elementId)) {
    log(`Message ${message.messageId} already showing in element ${elementId}.`);
    return null;
  }

  var options = {
    endpoint: settings.ENGINE_API_ENDPOINT[Gist.config.env],
    siteId: Gist.config.siteId,
    dataCenter: Gist.config.dataCenter,
    messageId: message.messageId,
    instanceId: message.instanceId,
    livePreview: false,
    properties: message.properties
  }
  var url = `${settings.GIST_VIEW_ENDPOINT[Gist.config.env]}/index.html?options=${encodeUnicode(JSON.stringify(options))}`
  window.addEventListener('message', handleGistEvents);
  window.addEventListener('touchstart', handleTouchStartEvents);

  if (elementId) {
    if (positions.includes(elementId)) { addPageElement(elementId); }
    loadEmbedComponent(elementId, url, message);
  } else {
    loadOverlayComponent(url, message);
  }

  return message;
}

function encodeUnicode(str) {
  var base64Unicode = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
          return String.fromCharCode('0x' + p1);
  }));

  return encodeURIComponent(base64Unicode);
}

async function reportMessageView(message) {
  Gist.messageShown(message);
  log(`Message shown, logging view for: ${message.messageId}`);
  var response = {};
  if (message.queueId != null) {
    response = await logUserMessageView(message.queueId);
  } else {
    response = await logMessageView(message.messageId);
  }
  
  if (response.status === 200) {
    log(`Message view logged`);
  } else {
    log(`Problem logging message: ${response.status}`);
  }
}

export function fetchMessageByInstanceId(instanceId) {
  return Gist.currentMessages.find(message => message.instanceId === instanceId);
}

function removeMessageByInstanceId(instanceId) {
  Gist.currentMessages = Gist.currentMessages.filter(message => message.instanceId !== instanceId)
}

function updateMessageByInstanceId(instanceId, message) {
  removeMessageByInstanceId(instanceId);
  Gist.currentMessages.push(message);
}

// Added this to avoid errors in the console
function handleTouchStartEvents(e) {}

async function handleGistEvents(e) {
  if (e.data.gist) {
    var currentInstanceId = e.data.gist.instanceId;
    var currentMessage = fetchMessageByInstanceId(currentInstanceId);
    if (!currentMessage) { return; }
    var messageProperties = resolveMessageProperies(currentMessage);
    switch (e.data.gist.method) {
      case "routeLoaded": {
        var timeElapsed = (new Date().getTime() - currentMessage.renderStartTime) * 0.001;
        log(`Engine render for message: ${currentMessage.messageId} timer elapsed in ${timeElapsed.toFixed(3)} seconds`);
        currentMessage.currentRoute = e.data.gist.parameters.route;
        if (currentMessage.firstLoad) {
          shownMessages.push(currentMessage);
          if (currentMessage.overlay) {
            showOverlayComponent(currentMessage);
          } else {
            showEmbedComponent(currentMessage.elementId);
          }

          if (messageProperties.persistent) {
            log(`Persistent message shown, skipping logging view`);
          } else {
            await reportMessageView(currentMessage);
          }

          currentMessage.firstLoad = false;
        }
        updateMessageByInstanceId(currentInstanceId, currentMessage);
        break;
      }
      case "tap": {
        var action = e.data.gist.parameters.action;
        var name = e.data.gist.parameters.name;
        Gist.messageAction(currentMessage, action, name);
        
        if (e.data.gist.parameters.system && !messageProperties.persistent) {
          await hideMessage(currentMessage);
          break;
        }

        try {
          var url = new URL(action);
          if (url && url.protocol === "gist:") {
            var gistAction = url.href.replace("gist://", "").split('?')[0];
            switch (gistAction) {
              case "close":
                await hideMessage(currentMessage);
                await removePersistentMessage(currentMessage);
                await checkMessageQueue();
                break;
              case "showMessage":
                var messageId = url.searchParams.get('messageId');
                var properties = url.searchParams.get('properties');
                if (messageId) {
                  if (properties) {
                    properties = JSON.parse(atob(properties));
                  }
                  await Gist.showMessage({ messageId: messageId, properties: properties });
                }
                break;
              case "loadPage":
                var url = url.href.substring(url.href.indexOf('?url=') + 5);
                if (url) {
                  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/")) {
                    window.location.href = url;
                  } else {
                    window.location.href = window.location + url;
                  }
                }
                break;
            }
          }
        } catch (_) {}
        
        break;
      }
      case "routeChanged": {
        currentMessage.currentRoute = e.data.gist.parameters.route;
        currentMessage.renderStartTime = new Date().getTime();
        updateMessageByInstanceId(currentInstanceId, currentMessage);
        log(`Route changed to: ${currentMessage.currentRoute}`);
        break;
      }
      case "sizeChanged": {
        log(`Size Changed Width: ${e.data.gist.parameters.width} - Height: ${e.data.gist.parameters.height}`)
        if (currentMessage.elementId && currentMessage.shouldResizeHeight) {
          resizeComponent(currentMessage.elementId, e.data.gist.parameters, currentMessage.shouldScale);
        } else {
          resizeComponent("gist-message", e.data.gist.parameters, currentMessage.shouldScale);
        }
        break;
      }
      case "error":
      case "routeError": {
        Gist.messageError(currentMessage);
        if (Gist.overlayInstanceId) {
          resetOverlayState(false, currentMessage);
        } else {
          resetEmbedState(currentMessage);
        }
        break;
      }
    }
  }
}

export function hasMessageBeenShownBefore(message) {
  return shownMessages.find(msg => msg.queueId === message.queueId) !== undefined;
}