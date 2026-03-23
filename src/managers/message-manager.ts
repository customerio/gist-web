import Gist from '../gist';
import { log } from '../utilities/log';
import { logMessageView, logUserMessageView } from '../services/log-service';
import { v4 as uuidv4 } from 'uuid';
import { settings } from '../services/settings';
import {
  loadOverlayComponent,
  showOverlayComponent,
  hideOverlayComponent,
  removeOverlayComponent,
  loadEmbedComponent,
  showEmbedComponent,
  hideEmbedComponent,
  resizeComponent,
  resizeTooltipComponent,
  elementHasHeight,
  changeOverlayTitle,
  sendDisplaySettingsToIframe,
  loadTooltipComponent,
  showTooltipComponent,
  hideTooltipComponent,
} from './message-component-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import { positions, addPageElement } from './page-component-manager';
import { getAllCustomAttributes } from './custom-attribute-manager';
import { checkMessageQueue } from './queue-manager';
import {
  isMessageBroadcast,
  markBroadcastAsSeen,
  markBroadcastAsDismissed,
  isShowAlwaysBroadcast,
} from './message-broadcast-manager';
import {
  markUserQueueMessageAsSeen,
  saveMessageState,
  clearMessageState,
  setMessageLoaded,
} from './message-user-queue-manager';
import {
  fetchMessageByInstanceId,
  fetchMessageByElementId,
  isQueueIdAlreadyShowing,
  removeMessageByInstanceId,
  updateMessageByInstanceId,
  hasDisplayChanged,
  applyDisplaySettings,
  getCurrentDisplayType,
} from '../utilities/message-utils';
import {
  updatePreviewBarMessage,
  updatePreviewBarStep,
  clearPreviewBarMessage,
} from './preview-bar-manager';
import { PREVIEW_PARAM_ID, PREVIEW_SETTINGS_PARAM } from '../utilities/preview-mode';
import type { GistMessage, DisplaySettings, MessageProperties } from '../types';

interface GistEventData {
  gist?: {
    method: string;
    instanceId: string;
    parameters: Record<string, unknown>;
  };
}

export async function showMessage(message: GistMessage): Promise<GistMessage | null> {
  if (!Gist.isDocumentVisible) {
    log('Document hidden, not showing message now.');
    return null;
  }

  if (isQueueIdAlreadyShowing(message.queueId)) {
    log(`Message with queueId ${message.queueId} is already showing.`);
    return null;
  }

  const properties = resolveMessageProperties(message);

  // Detect tooltip from properties if not already set on message
  if (!message.tooltipPosition && properties.hasTooltipPosition) {
    message.tooltipPosition = properties.tooltipPosition;
  }

  // Route to tooltip flow
  if (message.tooltipPosition) {
    return showTooltipMessage(message, properties);
  }

  // Original overlay flow
  if (Gist.overlayInstanceId) {
    log(`Message ${Gist.overlayInstanceId} already showing.`);
    return null;
  }

  message.instanceId = uuidv4();
  message.overlay = true;
  message.firstLoad = true;
  message.shouldResizeHeight = true;
  message.shouldScale = properties.shouldScale;
  message.renderStartTime = new Date().getTime();
  Gist.overlayInstanceId = message.instanceId;
  Gist.currentMessages.push(message);

  const savedStep = message.savedStepName || null;
  return loadMessageComponent(message, null, savedStep);
}

function showTooltipMessage(
  message: GistMessage,
  properties: ReturnType<typeof resolveMessageProperties>
): GistMessage | null {
  const targetSelector = message.elementId || properties.elementId;
  if (!targetSelector) {
    log(`No target selector specified for tooltip message ${message.messageId}`);
    Gist.messageError(message);
    return null;
  }

  // Verify target element exists in the DOM
  try {
    const targetElement = document.querySelector(targetSelector);
    if (!targetElement) {
      log(
        `Tooltip target element "${targetSelector}" not found for message ${message.messageId}, skipping display`
      );
      Gist.messageError(message);
      return null;
    }
  } catch {
    log(`Invalid tooltip target selector "${targetSelector}" for message ${message.messageId}`);
    Gist.messageError(message);
    return null;
  }

  const existingTooltip = Gist.currentMessages.find(
    (m) => m.tooltipPosition && m.elementId === targetSelector
  );
  if (existingTooltip) {
    log(
      `Tooltip already showing on target "${targetSelector}" (instance ${existingTooltip.instanceId}), dismissing it first`
    );
    Gist.messageDismissed(existingTooltip);
    hideTooltipComponent(existingTooltip);
    if (existingTooltip.instanceId) {
      removeMessageByInstanceId(existingTooltip.instanceId);
    }
  }

  message.instanceId = uuidv4();
  message.overlay = false;
  message.firstLoad = true;
  message.shouldResizeHeight = false;
  message.shouldScale = false;
  message.renderStartTime = new Date().getTime();

  if (!message.elementId && properties.elementId) {
    message.elementId = properties.elementId;
  }

  Gist.currentMessages.push(message);

  const savedStep = message.savedStepName || null;
  return loadMessageComponent(message, null, savedStep);
}

export function embedMessage(message: GistMessage, elementId: string): GistMessage | null {
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

    const savedStep = message.savedStepName || null;
    return loadMessageComponent(message, elementId, savedStep);
  } else {
    log('Document hidden, not showing message now.');
    return null;
  }
}

export async function hideMessage(message: GistMessage): Promise<void> {
  if (message) {
    Gist.messageDismissed(message);
    await resetMessage(message);
  } else {
    log(`Message not found`);
  }
}

export async function resetMessage(message: GistMessage): Promise<void> {
  const displayType = getCurrentDisplayType(message);
  if (displayType === 'tooltip') {
    resetTooltipState(message);
  } else if (message.overlay) {
    await resetOverlayState(true, message);
  } else {
    resetEmbedState(message);
  }
}

export async function removePersistentMessage(message: GistMessage): Promise<void> {
  if (message) {
    const messageProperties = resolveMessageProperties(message);
    if (messageProperties.persistent) {
      log(`Persistent message dismissed, logging view`);
      await logUserMessageViewLocally(message);
      await reportMessageView(message);
      await clearMessageState(message.queueId ?? '');
    }
  } else {
    log(`Message not found`);
  }
}

function resetEmbedState(message: GistMessage): void {
  if (message.instanceId) {
    removeMessageByInstanceId(message.instanceId);
  }
  if (message.elementId) {
    hideEmbedComponent(message.elementId);
  }
  if (Gist.config.isPreviewSession) {
    clearPreviewBarMessage();
    exitPreviewSession();
  }
}

function resetTooltipState(message: GistMessage): void {
  hideTooltipComponent(message);
  if (message.instanceId) {
    removeMessageByInstanceId(message.instanceId);
  }
  if (Gist.currentMessages.length === 0) {
    window.removeEventListener('message', handleGistEvents);
    window.removeEventListener('touchstart', handleTouchStartEvents);
  }
  if (Gist.config.isPreviewSession) {
    clearPreviewBarMessage();
    exitPreviewSession();
  }
}

async function resetOverlayState(hideFirst: boolean, message: GistMessage): Promise<void> {
  if (hideFirst) {
    await hideOverlayComponent();
  } else {
    removeOverlayComponent();
  }

  if (Gist.currentMessages.length === 0) {
    window.removeEventListener('message', handleGistEvents);
    window.removeEventListener('touchstart', handleTouchStartEvents);
  }

  if (message.instanceId) {
    removeMessageByInstanceId(message.instanceId);
  }
  Gist.overlayInstanceId = null;
  if (Gist.config.isPreviewSession) {
    clearPreviewBarMessage();
    exitPreviewSession();
  }
}

function exitPreviewSession(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(PREVIEW_PARAM_ID);
  url.searchParams.delete(PREVIEW_SETTINGS_PARAM);
  history.replaceState(null, '', url.toString());
}

function loadMessageComponent(
  message: GistMessage,
  elementId: string | null = null,
  stepName: string | null = null
): GistMessage {
  const env = Gist.config.env as keyof typeof settings.ENGINE_API_ENDPOINT &
    keyof typeof settings.GIST_VIEW_ENDPOINT;
  const options = {
    endpoint: settings.ENGINE_API_ENDPOINT[env],
    siteId: Gist.config.siteId,
    dataCenter: Gist.config.dataCenter,
    messageId: message.messageId,
    instanceId: message.instanceId ?? '',
    livePreview: false,
    properties: message.properties,
    customAttributes: Object.fromEntries(getAllCustomAttributes()),
  };

  const url = `${settings.GIST_VIEW_ENDPOINT[env]}/index.html`;
  window.addEventListener('message', handleGistEvents);
  window.addEventListener('touchstart', handleTouchStartEvents);

  const displayType = getCurrentDisplayType(message);

  if (displayType === 'tooltip') {
    loadTooltipComponent(url, message, options, stepName);
  } else if (elementId) {
    if (positions.includes(elementId)) {
      addPageElement(elementId);
    }
    loadEmbedComponent(elementId, url, message, options, stepName);
  } else {
    loadOverlayComponent(url, message, options, stepName);
  }

  return message;
}

async function reportMessageView(message: GistMessage): Promise<void> {
  log(`Message shown, logging view for: ${message.messageId}`);
  let response;
  if (message.queueId != null) {
    await logUserMessageViewLocally(message);
    response = await logUserMessageView(message.queueId);
  } else {
    response = await logMessageView(message.messageId);
  }

  if (response?.status === 200) {
    log(`Message view logged`);
  } else {
    log(`Problem logging message: ${response?.status}`);
  }
}

function handleTouchStartEvents(): void {
  // Added this to avoid errors in the console
}

async function handleGistEvents(e: MessageEvent): Promise<void> {
  const data = e.data as GistEventData;
  if (data.gist && e.origin === settings.RENDERER_HOST) {
    const currentInstanceId = data.gist.instanceId;
    const currentMessage = fetchMessageByInstanceId(currentInstanceId);
    if (!currentMessage) {
      return;
    }
    const messageProperties = resolveMessageProperties(currentMessage);
    switch (data.gist.method) {
      case 'routeLoaded': {
        const timeElapsed = (new Date().getTime() - (currentMessage.renderStartTime ?? 0)) * 0.001;
        log(
          `Engine render for message: ${currentMessage.messageId} timer elapsed in ${timeElapsed.toFixed(3)} seconds`
        );
        setMessageLoaded(currentMessage.queueId ?? '');
        currentMessage.currentRoute = data.gist.parameters.route as string;
        if (data.gist.parameters.fullDisplaySettings && !currentMessage.displaySettings) {
          currentMessage.displaySettings = data.gist.parameters
            .fullDisplaySettings as DisplaySettings;
        } else if (currentMessage.displaySettings) {
          log(`SDK already has display settings state, sending it to iframe`);
          sendDisplaySettingsToIframe(currentMessage);
        }
        if (Gist.config.isPreviewSession && currentMessage.properties?.gist?.livePreview) {
          updatePreviewBarMessage(currentMessage);
        }
        if (currentMessage.firstLoad || currentMessage.isDisplayChange) {
          const displayType = getCurrentDisplayType(currentMessage);

          if (displayType === 'tooltip') {
            const targetSelector =
              (currentMessage.properties?.gist?.elementId as string | undefined) ||
              currentMessage.elementId ||
              undefined;
            let targetFound = false;
            try {
              targetFound = !!targetSelector && !!document.querySelector(targetSelector);
            } catch {
              log(
                `Invalid tooltip target selector "${targetSelector}" for message ${currentMessage.messageId}`
              );
            }
            if (!targetFound) {
              log(
                `Tooltip target not found for "${targetSelector}", emitting error and skipping display`
              );
              Gist.messageError(currentMessage);
              resetTooltipState(currentMessage);
              break;
            }
            showTooltipComponent(currentMessage);
          } else if (currentMessage.overlay) {
            showOverlayComponent(currentMessage);
          } else {
            showEmbedComponent(currentMessage.elementId!);
          }

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
      case 'tap': {
        const action = data.gist.parameters.action as string;
        const name = data.gist.parameters.name as string;
        Gist.messageAction(currentMessage, action, name);

        if (data.gist.parameters.system && !messageProperties.persistent) {
          await hideMessage(currentMessage);
          break;
        }

        try {
          const actionUrl = new URL(action);
          if (actionUrl && actionUrl.protocol === 'gist:') {
            const gistAction = actionUrl.href.replace('gist://', '').split('?')[0];
            switch (gistAction) {
              case 'close':
                await removePersistentMessage(currentMessage);
                await logBroadcastDismissedLocally(currentMessage);
                await hideMessage(currentMessage);
                await checkMessageQueue();
                break;
              case 'showMessage': {
                const messageId = actionUrl.searchParams.get('messageId');
                const propertiesParam = actionUrl.searchParams.get('properties');
                if (messageId) {
                  const properties: MessageProperties | undefined = propertiesParam
                    ? JSON.parse(atob(propertiesParam))
                    : undefined;
                  await Gist.showMessage({
                    messageId: messageId,
                    properties: properties,
                  });
                }
                break;
              }
              case 'loadPage': {
                const redirectUrl = actionUrl.href.substring(actionUrl.href.indexOf('?url=') + 5);
                if (redirectUrl) {
                  if (
                    redirectUrl.startsWith('mailto:') ||
                    redirectUrl.startsWith('https://') ||
                    redirectUrl.startsWith('http://') ||
                    redirectUrl.startsWith('/')
                  ) {
                    window.location.href = redirectUrl;
                  } else {
                    window.location.href = window.location + redirectUrl;
                  }
                }
                break;
              }
            }
          }
        } catch {
          // If the action is not a URL, we don't need to do anything.
        }

        break;
      }
      case 'changeMessageStep': {
        const displaySettings = data.gist.parameters.displaySettings as DisplaySettings | undefined;
        const messageStepName = data.gist.parameters.messageStepName as string | undefined;

        if (
          Gist.config.isPreviewSession &&
          messageStepName &&
          currentMessage.properties?.gist?.livePreview
        ) {
          updatePreviewBarStep(messageStepName, displaySettings!);
        }

        if (messageProperties.persistent || isShowAlwaysBroadcast(currentMessage)) {
          await saveMessageState(currentMessage.queueId ?? '', messageStepName, displaySettings);
        }

        if (displaySettings && hasDisplayChanged(currentMessage, displaySettings)) {
          log(`Display settings changed, reloading message`);
          await hideMessageVisually(currentMessage);
          applyDisplaySettings(currentMessage, displaySettings);
          await reloadMessageWithNewDisplay(currentMessage, messageStepName ?? null);
        }
        break;
      }
      case 'routeChanged': {
        currentMessage.currentRoute = data.gist.parameters.route as string;
        currentMessage.renderStartTime = new Date().getTime();
        updateMessageByInstanceId(currentInstanceId, currentMessage);
        log(`Route changed to: ${currentMessage.currentRoute}`);
        break;
      }
      case 'sizeChanged': {
        log(
          `Size Changed Width: ${data.gist.parameters.width} - Height: ${data.gist.parameters.height}`
        );
        const sizeDisplayType = getCurrentDisplayType(currentMessage);
        if (sizeDisplayType === 'tooltip') {
          resizeTooltipComponent(
            currentMessage,
            data.gist.parameters as { width: number; height: number }
          );
        } else if (!currentMessage.elementId || currentMessage.shouldResizeHeight) {
          resizeComponent(
            currentMessage,
            data.gist.parameters as { width: number; height: number }
          );
        }
        break;
      }
      case 'titleChanged': {
        log(`Overlay title changed to: ${data.gist.parameters.title}`);
        changeOverlayTitle(currentInstanceId, data.gist.parameters.title as string);
        break;
      }
      case 'eventDispatched': {
        Gist.events.dispatch('eventDispatched', {
          name: data.gist.parameters.name,
          payload: data.gist.parameters.payload,
        });
        break;
      }
      case 'error':
      case 'routeError': {
        Gist.messageError(currentMessage);
        const displayType = getCurrentDisplayType(currentMessage);
        if (displayType === 'tooltip') {
          resetTooltipState(currentMessage);
        } else if (Gist.overlayInstanceId) {
          await resetOverlayState(false, currentMessage);
        } else {
          resetEmbedState(currentMessage);
        }
        break;
      }
    }
  }
}

async function reloadMessageWithNewDisplay(
  message: GistMessage,
  stepName: string | null
): Promise<void> {
  message.isDisplayChange = true;
  message.renderStartTime = new Date().getTime();

  const displayType = getCurrentDisplayType(message);
  const elementId = message.elementId || null;

  if (displayType === 'tooltip') {
    if (Gist.overlayInstanceId === message.instanceId) {
      Gist.overlayInstanceId = null;
    }
    message.shouldScale = false;
    message.shouldResizeHeight = false;
    loadMessageComponent(message, null, stepName);
    return;
  }

  if (elementId) {
    const existingMessage = fetchMessageByElementId(elementId);
    if (existingMessage && existingMessage.instanceId !== message.instanceId) {
      log(`Dismissing existing message at ${elementId} to make room for multi-step message`);
      await hideMessage(existingMessage);
    }
  }

  if (message.overlay) {
    Gist.overlayInstanceId = message.instanceId ?? null;
    const properties = resolveMessageProperties(message);
    message.shouldScale = properties.shouldScale;
    message.shouldResizeHeight = true;
  } else {
    Gist.overlayInstanceId = null;
    message.shouldScale = false;
    message.shouldResizeHeight = !elementHasHeight(elementId ?? '');
  }

  if (elementId && positions.includes(elementId)) {
    addPageElement(elementId);
  }

  loadMessageComponent(message, elementId, stepName);
}

export async function hideMessageVisually(message: GistMessage): Promise<void> {
  const displayType = getCurrentDisplayType(message);
  if (displayType === 'tooltip') {
    hideTooltipComponent(message);
  } else if (message.overlay) {
    await hideOverlayComponent();
  } else if (message.elementId) {
    hideEmbedComponent(message.elementId);
  }
}

export async function applyMessageStepChange(
  message: GistMessage,
  stepName: string | null | undefined,
  displaySettings: DisplaySettings | undefined
): Promise<void> {
  if (displaySettings && hasDisplayChanged(message, displaySettings)) {
    await hideMessageVisually(message);
    applyDisplaySettings(message, displaySettings);
  }
  await reloadMessageWithNewDisplay(message, stepName ?? null);
}

async function logUserMessageViewLocally(message: GistMessage): Promise<void> {
  log(`Logging user message view locally for: ${message.queueId}`);
  if (isMessageBroadcast(message)) {
    await markBroadcastAsSeen(message.queueId ?? '');
  } else {
    await markUserQueueMessageAsSeen(message.queueId ?? '');
  }
}

export async function logBroadcastDismissedLocally(message: GistMessage): Promise<void> {
  if (isMessageBroadcast(message)) {
    log(`Logging broadcast dismissed locally for: ${message.queueId}`);
    await markBroadcastAsDismissed(message.queueId ?? '');
    await clearMessageState(message.queueId ?? '');
  }
}
