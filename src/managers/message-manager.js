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
  changeOverlayTitle,
  sendDisplaySettingsToIframe
} from "./message-component-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { positions, addPageElement } from "./page-component-manager";
import { getAllCustomAttributes } from "./custom-attribute-manager";
import { checkMessageQueue } from "./queue-manager";
import { isMessageBroadcast, markBroadcastAsSeen, markBroadcastAsDismissed, isShowAlwaysBroadcast } from './message-broadcast-manager';
import { markUserQueueMessageAsSeen, saveMessageState, clearMessageState } from './message-user-queue-manager';
import { setMessageLoaded } from './message-user-queue-manager';
import { 
  fetchMessageByInstanceId,
  fetchMessageByElementId,
  isQueueIdAlreadyShowing,
  removeMessageByInstanceId,
  updateMessageByInstanceId,
  hasDisplayChanged,
  applyDisplaySettings
} from '../utilities/message-utils';
import { updatePreviewBarMessage, updatePreviewBarStep, clearPreviewBarMessage } from './preview-bar-manager';
import { PREVIEW_PARAM_ID, PREVIEW_SETTINGS_PARAM } from '../utilities/preview-mode';

export async function showMessage(message) {
  if (Gist.isDocumentVisible) {
    if (isQueueIdAlreadyShowing(message.queueId)) {
      log(`Message with queueId ${message.queueId} is already showing.`);
      return null;
    }
    if (Gist.overlayInstanceId) {
      log(`Message ${Gist.overlayInstanceId} already showing.`);
      return null;
    } else {
      var properties = resolveMessageProperties(message);
      
      message.instanceId = uuidv4();
      message.overlay = true;
      message.firstLoad = true;
      message.shouldResizeHeight = true;
      message.shouldScale = properties.shouldScale;
      message.renderStartTime = new Date().getTime();
      Gist.overlayInstanceId = message.instanceId;
      Gist.currentMessages.push(message);

      // Use saved step if available (set by queue manager)
      const savedStep = message.savedStepName || null;
      return loadMessageComponent(message, null, savedStep);
    }
  } else {
    log("Document hidden, not showing message now.");
    return null;
  }
}

export function embedMessage(message, elementId) {
  if (Gist.isDocumentVisible) {
    if (isQueueIdAlreadyShowing(message.queueId)) {
      log(`Message with queueId ${message.queueId} is already showing.`);
      return null;
    }

    const existingMessage = fetchMessageByElementId(elementId);
    if (existingMessage) {
      log(`Message with elementId ${elementId} already has a message.`);
      return null;
    }

    message.instanceId = uuidv4();
    message.overlay = false;
    message.firstLoad = true;
    message.shouldScale = false;
    message.elementId = elementId;
    message.shouldResizeHeight = !elementHasHeight(elementId);
    message.renderStartTime = new Date().getTime();
    Gist.currentMessages.push(message);

    // Use saved step if available (set by queue manager)
    const savedStep = message.savedStepName || null;
    return loadMessageComponent(message, elementId, savedStep);
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
      // Clear saved message state when persistent message is removed
      await clearMessageState(message.queueId);
    }
  } else {
    log(`Message with instance id: ${message.instanceId} not found`);
  }
}

function resetEmbedState(message) {
  removeMessageByInstanceId(message.instanceId);
  hideEmbedComponent(message.elementId);
  if (Gist.config.isPreviewSession) {
    clearPreviewBarMessage();
    exitPreviewSession();
  }
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
  if (Gist.config.isPreviewSession) {
    clearPreviewBarMessage();
    exitPreviewSession();
  }
}

function exitPreviewSession() {
  const url = new URL(window.location.href);
  url.searchParams.delete(PREVIEW_PARAM_ID);
  url.searchParams.delete(PREVIEW_SETTINGS_PARAM);
  window.location.replace(url.toString());
}

function loadMessageComponent(message, elementId = null, stepName = null) {
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
        if (e.data.gist.parameters.fullDisplaySettings && !currentMessage.displaySettings) {
          currentMessage.displaySettings = e.data.gist.parameters.fullDisplaySettings;
        } else if (currentMessage.displaySettings) {
          log(`SDK already has display settings state, sending it to iframe`);
          sendDisplaySettingsToIframe(currentMessage);
        }
        if (Gist.config.isPreviewSession && currentMessage.properties?.gist?.livePreview) {
          updatePreviewBarMessage(currentMessage);
        }
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
          }
        } catch {
          // If the action is not a URL, we don't need to do anything.
        }
        
        break;
      }
      case "changeMessageStep": {
        var displaySettings = e.data.gist.parameters.displaySettings;
        var messageStepName = e.data.gist.parameters.messageStepName;
        
        if (Gist.config.isPreviewSession && messageStepName && currentMessage.properties?.gist?.livePreview) {
          updatePreviewBarStep(messageStepName, displaySettings);
        }
        
        // Save message state (step + display settings) for persistent messages or show-always broadcasts
        if (messageProperties.persistent || isShowAlwaysBroadcast(currentMessage)) {
          await saveMessageState(currentMessage.queueId, messageStepName, displaySettings);
        }
        
        if (displaySettings && hasDisplayChanged(currentMessage, displaySettings)) {
          log(`Display settings changed, reloading message`);
          await applyMessageStepChange(currentMessage, messageStepName, displaySettings);
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

// Navigate to a specific step, applying any display setting changes along the way.
// Used by the preview bar step dropdown -- always reloads the iframe so the renderer
// shows the requested step, with or without a layout change.
export async function applyMessageStepChange(message, stepName, displaySettings) {
  if (displaySettings && hasDisplayChanged(message, displaySettings)) {
    await hideMessageVisually(message);
    applyDisplaySettings(message, displaySettings);
  }
  await reloadMessageWithNewDisplay(message, stepName);
}

// Reload message with new display settings
async function reloadMessageWithNewDisplay(message, stepName) {
  // Mark as display change reload to show component when routeLoaded is received
  // but without triggering messageShown event or logging view
  message.isDisplayChange = true;
  message.renderStartTime = new Date().getTime();

  // Determine elementId based on display type
  var elementId = message.elementId || null;

  // If moving to an elementId position, check if there's already a message there and dismiss it
  if (elementId) {
    const existingMessage = fetchMessageByElementId(elementId);
    if (existingMessage && existingMessage.instanceId !== message.instanceId) {
      log(`Dismissing existing message at ${elementId} to make room for multi-step message`);
      await hideMessage(existingMessage);
    }
  }
  
  // Update Gist.overlayInstanceId based on new display type
  if (message.overlay) {
    Gist.overlayInstanceId = message.instanceId;
    // Set properties for overlay display
    var properties = resolveMessageProperties(message);
    message.shouldScale = properties.shouldScale;
    message.shouldResizeHeight = true;
  } else {
    Gist.overlayInstanceId = null;
    // Set properties for embedded display
    message.shouldScale = false;
    message.shouldResizeHeight = !elementHasHeight(elementId);
  }
  
  // Add page element if it's an overlay position
  if (elementId && positions.includes(elementId)) {
    addPageElement(elementId);
  }
  
  // Reload the message component with new settings
  // Component will be shown when routeLoaded event is received
  loadMessageComponent(message, elementId, stepName);
}

// Visual-only hide without side effects
export async function hideMessageVisually(message) {
  if (message.overlay) {
    await hideOverlayComponent();
  } else {
    hideEmbedComponent(message.elementId);
  }
  // Note: We don't call removeMessageByInstanceId or clear Gist.overlayInstanceId
  // to keep the message in memory for re-rendering
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
    // Clear saved message state when broadcast is dismissed
    await clearMessageState(message.queueId);
  }
}
