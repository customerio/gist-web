import Gist from '../gist';
import { log } from "../utilities/log";
import { logMessageView, logUserMessageView } from "../services/log-service";
import * as AnalyticsManager from "./analytics-manager";
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
  elementHasHeight
} from "./message-component-manager";
import { resolveMessageProperies } from "./gist-properties-manager";

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
      loadMessageComponent(message);
      return message;
    }
  } else {
    log("Document hidden, not showing message now.");
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
    loadMessageComponent(message, elementId);
    return message;
  } else {
    log("Document hidden, not showing message now.");
  }
}

export function hideMessage(instanceId) {
  var message = fetchMessageByInstanceId(instanceId);
  if (message) {
    AnalyticsManager.logEvent(AnalyticsManager.GIST_DISMISSED, message);
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
  var options = {
    organizationId: Gist.config.organizationId,
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
    loadEmbedComponent(elementId, url);
  } else {
    loadOverlayComponent(url, message.instanceId);
  }
}

function encodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
      function toSolidBytes(match, p1) {
          return String.fromCharCode('0x' + p1);
  }));
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
        AnalyticsManager.logEvent(AnalyticsManager.GIST_LOADED, currentMessage);
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

        if (e.data.gist.parameters.system == true) {
          AnalyticsManager.logEvent(AnalyticsManager.GIST_SYSTEM_ACTION, currentMessage);
          hideMessage(currentInstanceId);
          break;
        }

        var shouldLogEvent = true;
        var url = new URL(action);
        if (url && url.protocol === "gist:") {
          var gistAction = url.href.replace("gist://", "").split('?')[0];
          switch (gistAction) {
            case "close":
              hideMessage(currentInstanceId);
              shouldLogEvent = false;
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
                window.location.href = url;
              }
              break;
          }
        }

        if (shouldLogEvent) {
          AnalyticsManager.logEvent(AnalyticsManager.GIST_ACTION, currentMessage);
        }
        Gist.messageAction(currentMessage, action);
        
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