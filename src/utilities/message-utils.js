import Gist from '../gist';
import { positions } from '../managers/page-component-manager';
import { resolveMessageProperties } from '../managers/gist-properties-manager';
import { log } from './log';

export const wideOverlayPositions = ["x-gist-top", "x-gist-bottom", "x-gist-floating-top", "x-gist-floating-bottom"];

export function fetchMessageByInstanceId(instanceId) {
  return Gist.currentMessages.find(message => message.instanceId === instanceId);
}

export function isQueueIdAlreadyShowing(queueId) {
  if (!queueId) {
    return false;
  }
  return Gist.currentMessages.some(message => message.queueId === queueId);
}

export function fetchMessageByElementId(elementId) {
  if (!elementId) {
    return null;
  }
  return Gist.currentMessages.find(message => message.elementId === elementId);
}

export function removeMessageByInstanceId(instanceId) {
  Gist.currentMessages = Gist.currentMessages.filter(message => message.instanceId !== instanceId)
}

export function updateMessageByInstanceId(instanceId, message) {
  const index = Gist.currentMessages.findIndex(m => m.instanceId === instanceId);
  if (index !== -1) {
    Gist.currentMessages[index] = message;
  } else {
    Gist.currentMessages.push(message);
  }
}

export function mapOverlayPositionToElementId(overlayPosition) {
  const positionMap = {
    "topLeft": "x-gist-floating-top-left",
    "topCenter": "x-gist-floating-top",
    "topRight": "x-gist-floating-top-right",
    "bottomLeft": "x-gist-floating-bottom-left",
    "bottomCenter": "x-gist-floating-bottom",
    "bottomRight": "x-gist-floating-bottom-right"
  };
  
  // Validate overlayPosition and provide fallback
  if (!overlayPosition || !positionMap[overlayPosition]) {
    log(`Invalid overlay position "${overlayPosition}", defaulting to "topCenter"`);
    return positionMap["topCenter"];
  }
  
  return positionMap[overlayPosition];
}

// Helper function to determine current display type
export function getCurrentDisplayType(message) {
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
export function hasDisplayChanged(currentMessage, displaySettings) {
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
  
  // Check if other display settings changed using resolved properties
  const resolvedProps = resolveMessageProperties(currentMessage);

  // Check if position changed within the same display type
  switch (newDisplayType) {
    case "modal": {
      const currentPosition = currentMessage.position || "center";
      const newPosition = displaySettings.modalPosition || "center";
      if (currentPosition !== newPosition) {
        return true;
      }

      if (displaySettings.dismissOutsideClick !== undefined) {
        if (resolvedProps.exitClick !== displaySettings.dismissOutsideClick) {
          return true;
        }
      }
      
      if (displaySettings.overlayColor !== undefined) {
        if (resolvedProps.overlayColor !== displaySettings.overlayColor) {
          return true;
        }
      }
      break;
    }
    case "overlay": {
      const newElementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
      if (currentMessage.elementId !== newElementId) {
        return true;
      }
      break;
    }
    case "inline": {
      if (currentMessage.elementId !== displaySettings.elementSelector) {
        return true;
      }
      break;
    }
  }
  
  if (displaySettings.maxWidth !== undefined) {
    if (resolvedProps.messageWidth !== displaySettings.maxWidth) {
      return true;
    }
  }
  
  return false;
}

// Apply display settings to message
export function applyDisplaySettings(message, displaySettings) {
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
    message.properties.gist.elementId = null; // Also update in gist properties
    message.position = displaySettings.modalPosition || "center";
    message.properties.gist.position = displaySettings.modalPosition || "center";
  } else if (displaySettings.displayType === "overlay") {
    message.overlay = false;
    const elementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
    message.elementId = elementId;
    message.properties.gist.elementId = elementId; // Also update in gist properties
    message.position = null;
    message.properties.gist.position = null;
  } else if (displaySettings.displayType === "inline") {
    message.overlay = false;
    message.elementId = displaySettings.elementSelector;
    message.properties.gist.elementId = displaySettings.elementSelector; // Also update in gist properties
    message.position = null;
    message.properties.gist.position = null;
  }
  
  // Apply width settings - clear if not specified so defaults are used
  // This is especially important for wide overlay positions (top/bottom) which should use 100% width
  const isWideOverlayPosition = message.elementId && wideOverlayPositions.includes(message.elementId);
  
  // For wide overlay positions, ALWAYS clear custom width to ensure 100% width
  if (isWideOverlayPosition) {
    delete message.properties.gist.messageWidth;
  } else if (displaySettings.maxWidth !== undefined && displaySettings.maxWidth > 0) {
    message.properties.gist.messageWidth = displaySettings.maxWidth;
  } else {
    delete message.properties.gist.messageWidth;
  }
  
  if (displaySettings.overlayColor !== undefined) {
    message.properties.gist.overlayColor = displaySettings.overlayColor;
  } else {
    delete message.properties.gist.overlayColor;
  }
  
  if (displaySettings.dismissOutsideClick !== undefined) {
    message.properties.gist.exitClick = displaySettings.dismissOutsideClick;
  } else {
    delete message.properties.gist.exitClick;
  }
}

