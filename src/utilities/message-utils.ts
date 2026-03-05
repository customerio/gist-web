import Gist from '../gist';
import { positions } from '../managers/page-component-manager';
import { resolveMessageProperties } from '../managers/gist-properties-manager';
import { log } from './log';
import type { GistMessage, DisplaySettings } from '../types';

export const wideOverlayPositions: readonly string[] = [
  'x-gist-top',
  'x-gist-bottom',
  'x-gist-floating-top',
  'x-gist-floating-bottom',
];

export function fetchMessageByInstanceId(instanceId: string): GistMessage | undefined {
  return Gist.currentMessages.find((message: GistMessage) => message.instanceId === instanceId);
}

export function isQueueIdAlreadyShowing(queueId: string | undefined): boolean {
  if (!queueId) {
    return false;
  }
  return Gist.currentMessages.some((message: GistMessage) => message.queueId === queueId);
}

export function fetchMessageByElementId(elementId: string | null | undefined): GistMessage | null {
  if (!elementId) {
    return null;
  }
  return (
    Gist.currentMessages.find((message: GistMessage) => message.elementId === elementId) ?? null
  );
}

export function removeMessageByInstanceId(instanceId: string): void {
  Gist.currentMessages = Gist.currentMessages.filter(
    (message: GistMessage) => message.instanceId !== instanceId
  );
}

export function updateMessageByInstanceId(instanceId: string, message: GistMessage): void {
  removeMessageByInstanceId(instanceId);
  Gist.currentMessages.push(message);
}

export function mapOverlayPositionToElementId(overlayPosition: string | undefined): string {
  const positionMap: Record<string, string> = {
    topLeft: 'x-gist-floating-top-left',
    topCenter: 'x-gist-floating-top',
    topRight: 'x-gist-floating-top-right',
    bottomLeft: 'x-gist-floating-bottom-left',
    bottomCenter: 'x-gist-floating-bottom',
    bottomRight: 'x-gist-floating-bottom-right',
  };

  if (!overlayPosition || !positionMap[overlayPosition]) {
    log(`Invalid overlay position "${overlayPosition}", defaulting to "topCenter"`);
    return positionMap['topCenter'];
  }

  return positionMap[overlayPosition];
}

export function getCurrentDisplayType(
  message: GistMessage
): 'modal' | 'overlay' | 'inline' | 'tooltip' {
  if (message.tooltipPosition) {
    return 'tooltip';
  }
  if (message.overlay) {
    return 'modal';
  } else if (message.elementId && positions.includes(message.elementId)) {
    return 'overlay';
  } else if (message.elementId) {
    return 'inline';
  }
  return 'modal';
}

export function hasDisplayChanged(
  currentMessage: GistMessage,
  displaySettings: DisplaySettings
): boolean {
  const currentDisplayType = getCurrentDisplayType(currentMessage);
  const newDisplayType = displaySettings.displayType;

  if (newDisplayType === undefined) {
    return false;
  }

  if (currentDisplayType !== newDisplayType) {
    return true;
  }

  const resolvedProps = resolveMessageProperties(currentMessage);

  switch (newDisplayType) {
    case 'modal': {
      const currentPosition = currentMessage.position || 'center';
      const newPosition = displaySettings.modalPosition || 'center';
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
    case 'overlay': {
      const newElementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
      if (currentMessage.elementId !== newElementId) {
        return true;
      }
      break;
    }
    case 'inline': {
      if (currentMessage.elementId !== displaySettings.elementSelector) {
        return true;
      }
      break;
    }
    case 'tooltip': {
      if (currentMessage.tooltipPosition !== displaySettings.tooltipPosition) {
        return true;
      }
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

export function applyDisplaySettings(message: GistMessage, displaySettings: DisplaySettings): void {
  if (!message.properties) {
    message.properties = {};
  }
  if (!message.properties.gist) {
    message.properties.gist = {};
  }

  if (displaySettings.displayType === 'modal') {
    message.overlay = true;
    message.elementId = null;
    message.properties.gist.elementId = null;
    message.position = displaySettings.modalPosition || 'center';
    message.properties.gist.position = displaySettings.modalPosition || 'center';
  } else if (displaySettings.displayType === 'overlay') {
    message.overlay = false;
    const elementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
    message.elementId = elementId;
    message.properties.gist.elementId = elementId;
    message.position = null;
    message.properties.gist.position = null;
  } else if (displaySettings.displayType === 'inline') {
    message.overlay = false;
    message.elementId = displaySettings.elementSelector;
    message.properties.gist.elementId = displaySettings.elementSelector;
    message.position = null;
    message.properties.gist.position = null;
  } else if (displaySettings.displayType === 'tooltip') {
    message.overlay = false;
    message.elementId = displaySettings.elementSelector;
    message.properties.gist.elementId = displaySettings.elementSelector;
    message.tooltipPosition = displaySettings.tooltipPosition;
    message.properties.gist.tooltipPosition = displaySettings.tooltipPosition;
    message.position = null;
    message.properties.gist.position = null;
  }

  const isWideOverlayPosition =
    message.elementId && wideOverlayPositions.includes(message.elementId);

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
