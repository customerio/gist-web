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
  isElementLoaded,
  changeOverlayTitle
} from "./message-component-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { positions, addPageElement } from "./page-component-manager";
import { getAllCustomAttributes } from "./custom-attribute-manager";
import { checkMessageQueue } from "./queue-manager";
import { isMessageBroadcast, markBroadcastAsSeen, markBroadcastAsDismissed } from './message-broadcast-manager';
import { markUserQueueMessageAsSeen } from './message-user-queue-manager';
import { setMessageLoaded } from './message-user-queue-manager';

export async function showMessage(message) {
  if (Gist.isDocumentVisible) {
    if (Gist.overlayInstanceId) {
      log(`Message ${Gist.overlayInstanceId} already showing.`);
      return null;
    } else {
      var properties = resolveMessageProperties(message)
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
    log(`Message with instance id: ${message.instanceId} not found`);
  }
}

export async function removePersistentMessage(message) {
  var messageProperties = resolveMessageProperties(message);
  if (message) {
    if (messageProperties.persistent) {
      log(`Persistent message dismissed, logging view`);
      await logUserMessageViewLocally(message);
      await reportMessageView(message);
    }
  } else {
    log(`Message with instance id: ${message.instanceId} not found`);
  }
}

function resetEmbedState(message) {
  removeMessageByInstanceId(message.instanceId);
  hideEmbedComponent(message.elementId);
}

async function resetOverlayState(hideFirst, message) {
  if (hideFirst) {
    await hideOverlayComponent();
  } else {
    removeOverlayComponent();
  }

  if (Gist.currentMessages.length == 0) {
    window.removeEventListener('message', handleGistEvents);
    window.removeEventListener('touchstart', handleTouchStartEvents);
  }

  removeMessageByInstanceId(message.instanceId);
  Gist.overlayInstanceId = null;
}

function loadMessageComponent(message, elementId = null, stepName = null) {
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
    properties: message.properties,
    customAttributes: Object.fromEntries(getAllCustomAttributes())
  }
  
  var url = `${settings.GIST_VIEW_ENDPOINT[Gist.config.env]}/index.html`
  window.addEventListener('message', handleGistEvents);
  window.addEventListener('touchstart', handleTouchStartEvents);

  if (elementId) {
    if (positions.includes(elementId)) { addPageElement(elementId); }
    loadEmbedComponent(elementId, url, message, options, stepName);
  } else {
    loadOverlayComponent(url, message, options, stepName);
  }

  return message;
}

async function reportMessageView(message) {
  log(`Message shown, logging view for: ${message.messageId}`);
  var response = {};
  if (message.queueId != null) {
    await logUserMessageViewLocally(message);
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

function handleTouchStartEvents() {
  // Added this to avoid errors in the console
}

async function handleGistEvents(e) {
  if (e.data.gist && e.origin === settings.RENDERER_HOST) {
    var currentInstanceId = e.data.gist.instanceId;
    var currentMessage = fetchMessageByInstanceId(currentInstanceId);
    if (!currentMessage) { return; }
    var messageProperties = resolveMessageProperties(currentMessage);
    switch (e.data.gist.method) {
      case "routeLoaded": {
        var timeElapsed = (new Date().getTime() - currentMessage.renderStartTime) * 0.001;
        log(`Engine render for message: ${currentMessage.messageId} timer elapsed in ${timeElapsed.toFixed(3)} seconds`);
        setMessageLoaded(currentMessage.queueId);
        currentMessage.currentRoute = e.data.gist.parameters.route;
        
        // Show component for first load or display change reload
        if (currentMessage.firstLoad || currentMessage.isDisplayChange) {
          if (currentMessage.overlay) {
            showOverlayComponent(currentMessage);
          } else {
            showEmbedComponent(currentMessage.elementId);
          }

          // Only trigger events for actual first load, not display changes
          if (currentMessage.firstLoad && !currentMessage.isDisplayChange) {
            Gist.messageShown(currentMessage);
            if (messageProperties.persistent) {
              log(`Persistent message shown, skipping logging view`);
            } else {
              await reportMessageView(currentMessage);
            }
          }

          currentMessage.firstLoad = false;
          currentMessage.isDisplayChange = false;
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
                await logBroadcastDismissedLocally(currentMessage);
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
                url = url.href.substring(url.href.indexOf('?url=') + 5);
                if (url) {
                  if (url.startsWith("mailto:") || url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/")) {
                    window.location.href = url;
                  } else {
                    window.location.href = window.location + url;
                  }
                }
                break;
            }
          } else if (url && url.protocol === "inapp:") {
            var inappAction = url.href.replace("inapp://", "").split('?')[0];
            switch (inappAction) {
              case "changeMessage":
                var displaySettings = e.data.gist.parameters.options?.displaySettings;
                var messageStepName = e.data.gist.parameters.options?.messageStepName;
                
                if (displaySettings && hasDisplayChanged(currentMessage, displaySettings)) {
                  log(`Display settings changed, reloading message`);
                  // Hide visually without side effects
                  await hideMessageVisually(currentMessage);
                  
                  // Apply new display settings
                  applyDisplaySettings(currentMessage, displaySettings);
                  
                  // Re-show message with new settings
                  await reloadMessageWithNewDisplay(currentMessage, messageStepName);
                }
                break;
            }
          }
        } catch {
          // If the action is not a URL, we don't need to do anything.
        }
        
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
        log(`Size Changed Width: ${e.data.gist.parameters.width} - Height: ${e.data.gist.parameters.height}`);
        if (!currentMessage.elementId || currentMessage.shouldResizeHeight) {
          resizeComponent(currentMessage, e.data.gist.parameters);
        }
        break;
      }
      case "titleChanged": {
        log(`Overlay title changed to: ${e.data.gist.parameters.title}`);
        changeOverlayTitle(currentInstanceId, e.data.gist.parameters.title);
        break;
      }
      case "eventDispatched": {
        Gist.events.dispatch("eventDispatched", { "name": e.data.gist.parameters.name, "payload": e.data.gist.parameters.payload });
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

// Reload message with new display settings
async function reloadMessageWithNewDisplay(message, stepName) {
  // Mark as display change reload to show component when routeLoaded is received
  // but without triggering messageShown event or logging view
  message.isDisplayChange = true;
  message.renderStartTime = new Date().getTime();
  
  // Update Gist.overlayInstanceId based on new display type
  if (message.overlay) {
    Gist.overlayInstanceId = message.instanceId;
  } else {
    Gist.overlayInstanceId = null;
  }
  
  // Determine elementId based on display type
  var elementId = message.elementId || null;
  
  // Add page element if it's an overlay position
  if (elementId && positions.includes(elementId)) {
    addPageElement(elementId);
  }
  
  // Reload the message component with new settings
  // Component will be shown when routeLoaded event is received
  loadMessageComponent(message, elementId, stepName);
}

// Helper function to map overlay positions to element IDs
function mapOverlayPositionToElementId(overlayPosition) {
  const positionMap = {
    "topLeft": "x-gist-floating-top-left",
    "topCenter": "x-gist-floating-top",
    "topRight": "x-gist-floating-top-right",
    "bottomLeft": "x-gist-floating-bottom-left",
    "bottomCenter": "x-gist-floating-bottom",
    "bottomRight": "x-gist-floating-bottom-right"
  };
  return positionMap[overlayPosition] || "x-gist-floating-bottom";
}

// Helper function to determine current display type
function getCurrentDisplayType(message) {
  if (message.overlay) {
    return "modal";
  } else if (message.elementId && positions.includes(message.elementId)) {
    return "overlay";
  } else if (message.elementId) {
    return "inline";
  }
  return "modal"; // default
}

// Helper function to check if display settings have changed
function hasDisplayChanged(currentMessage, displaySettings) {
  const currentDisplayType = getCurrentDisplayType(currentMessage);
  const newDisplayType = displaySettings.displayType;
  
  // If the new display type is undefined, we don't need to check if it has changed.
  if (newDisplayType === undefined) {
    return false;
  }

  // Check if display type changed
  if (currentDisplayType !== newDisplayType) {
    return true;
  }
  
  // Check if position changed within the same display type
  if (newDisplayType === "modal") {
    const currentPosition = currentMessage.position || "center";
    const newPosition = displaySettings.modalPosition || "center";
    if (currentPosition !== newPosition) {
      return true;
    }
  } else if (newDisplayType === "overlay") {
    const newElementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
    if (currentMessage.elementId !== newElementId) {
      return true;
    }
  } else if (newDisplayType === "inline") {
    if (currentMessage.elementId !== displaySettings.elementSelector) {
      return true;
    }
  }
  
  return false;
}

// Visual-only hide without side effects
async function hideMessageVisually(message) {
  if (message.overlay) {
    await hideOverlayComponent();
    removeOverlayComponent();
  } else {
    hideEmbedComponent(message.elementId);
  }
  // Note: We don't call removeMessageByInstanceId or clear Gist.overlayInstanceId
  // to keep the message in memory for re-rendering
}

// Apply display settings to message
function applyDisplaySettings(message, displaySettings) {
  // Ensure message.properties.gist exists
  if (!message.properties) {
    message.properties = {};
  }
  if (!message.properties.gist) {
    message.properties.gist = {};
  }
  
  // Apply display type specific settings
  if (displaySettings.displayType === "modal") {
    message.overlay = true; // Note: overlay property = true for modals
    message.elementId = null;
    message.position = displaySettings.modalPosition || "center";
  } else if (displaySettings.displayType === "overlay") {
    message.overlay = false;
    message.elementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
    message.position = null;
  } else if (displaySettings.displayType === "inline") {
    message.overlay = false;
    message.elementId = displaySettings.elementSelector;
    message.position = null;
  }
  
  // Apply other settings
  if (displaySettings.maxWidth !== undefined) {
    message.properties.gist.messageWidth = displaySettings.maxWidth;
  }
  if (displaySettings.overlayColor !== undefined) {
    message.properties.gist.overlayColor = displaySettings.overlayColor;
  }
  if (displaySettings.dismissOutsideClick !== undefined) {
    message.properties.gist.exitClick = displaySettings.dismissOutsideClick;
  }
}

async function logUserMessageViewLocally(message) {
  log(`Logging user message view locally for: ${message.queueId}`);
  if (isMessageBroadcast(message)) {
    await markBroadcastAsSeen(message.queueId);
  } else {
    await markUserQueueMessageAsSeen(message.queueId);
  }
}

export async function logBroadcastDismissedLocally(message) {
  if (isMessageBroadcast(message)) {
    log(`Logging broadcast dismissed locally for: ${message.queueId}`);
    await markBroadcastAsDismissed(message.queueId);
  }
}
