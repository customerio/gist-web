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

export function showMessage(message) {
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
      message.shouldScale = properties.shouldScale
      Gist.overlayInstanceId = message.instanceId;
      Gist.currentMessages.push(message);
      return loadMessageComponent(message);
    }
  } else {
    log("Document hidden, not showing message now.");
    return null;
  }
}

export function embedMessage(message, elementId) {
  if (Gist.isDocumentVisible) {
    message.instanceId = uuidv4();
    message.overlay = false;
    message.firstLoad = true;
    message.shouldScale = false;
    message.elementId = elementId;
    message.shouldResizeHeight = !elementHasHeight(elementId);
    Gist.currentMessages.push(message);
    return loadMessageComponent(message, elementId);
  } else {
    log("Document hidden, not showing message now.");
    return null;
  }
}

export function hideMessage(instanceId) {
  var message = fetchMessageByInstanceId(instanceId);
  if (message) {
    Gist.messageDismissed(message);

    if (message.overlay) {
      resetOverlayState(true, message);
    } else {
      resetEmbedState(message);
    }
  } else {
    log(`Message with instance id: ${instanceId} not found`);
  }
}

function resetEmbedState(message) {
  removeMessageByInstanceId(message.instanceId);
  hideEmbedComponent(message.elementId);
}

function resetOverlayState(hideFirst, message) {
  removeMessageByInstanceId(message.instanceId);
  Gist.overlayInstanceId = null;
  if (hideFirst) {
    hideOverlayComponent();
  } else {
    removeOverlayComponent();
  }

  if (Gist.currentMessages.length == 0) {
    window.removeEventListener('message', handleGistEvents);
    window.removeEventListener('touchstart', {});
  }
}

function loadMessageComponent(message, elementId = null) {
  if (elementId && isElementLoaded(elementId)) {
    log(`Message ${message.messageId} already showing in element ${elementId}.`);
    return null;
  }

  var options = {
    siteId: Gist.config.siteId,
    messageId: message.messageId,
    instanceId: message.instanceId,
    endpoint: settings.GIST_API_ENDPOINT[Gist.config.env],
    livePreview: false,
    properties: message.properties
  }
  var url = `${settings.GIST_VIEW_ENDPOINT[Gist.config.env]}/index.html?options=${encodeUnicode(JSON.stringify(options))}`
  window.addEventListener('message', handleGistEvents);
  window.addEventListener('touchstart', {});

  if (elementId) {
    if (positions.includes(elementId)) { addPageElement(elementId); }
    loadEmbedComponent(elementId, url);
  } else {
    loadOverlayComponent(url, message.instanceId);
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

function fetchMessageByInstanceId(instanceId) {
  return Gist.currentMessages.find(message => message.instanceId === instanceId);
}

function removeMessageByInstanceId(instanceId) {
  Gist.currentMessages = Gist.currentMessages.filter(message => message.instanceId !== instanceId)
}

function updateMessageByInstanceId(instanceId, message) {
  removeMessageByInstanceId(instanceId);
  Gist.currentMessages.push(message);
}

function handleGistEvents(e) {
  if (e.data.gist) {
    var currentInstanceId = e.data.gist.instanceId;
    var currentMessage = fetchMessageByInstanceId(currentInstanceId);
    switch (e.data.gist.method) {
      case "routeLoaded": {
        currentMessage.currentRoute = e.data.gist.parameters.route;
        if (currentMessage.firstLoad) {
          if (currentMessage.overlay) {
            showOverlayComponent(currentMessage);
          } else {
            showEmbedComponent(currentMessage.elementId);
          }
          reportMessageView(currentMessage);
          currentMessage.firstLoad = false;
        }
        updateMessageByInstanceId(currentInstanceId, currentMessage);
        break;
      }
      case "tap": {
        var action = e.data.gist.parameters.action;
        var name = e.data.gist.parameters.name;
        Gist.messageAction(currentMessage, action, name);
        
        if (e.data.gist.parameters.system == true) {
          hideMessage(currentInstanceId);
          break;
        }

        try {
          var url = new URL(action);
          if (url && url.protocol === "gist:") {
            var gistAction = url.href.replace("gist://", "").split('?')[0];
            switch (gistAction) {
              case "close":
                hideMessage(currentInstanceId);
                checkMessageQueue();
                break;
              case "showMessage":
                var messageId = url.searchParams.get('messageId');
                var properties = url.searchParams.get('properties');
                if (messageId) {
                  if (properties) {
                    properties = JSON.parse(atob(properties));
                  }
                  Gist.showMessage({ messageId: messageId, properties: properties });
                }
                break;
              case "loadPage":
                var url = url.searchParams.get('url');
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