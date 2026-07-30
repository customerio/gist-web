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
  sendShowStepToIframe,
  loadTooltipComponent,
  showTooltipComponent,
  hideTooltipComponent,
} from './message-component-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import { findElement } from '../utilities/dom';
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
  setMessageSnoozed,
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
  matchesPageUrl,
} from '../utilities/message-utils';
import {
  updatePreviewBarMessage,
  updatePreviewBarStep,
  clearPreviewBarMessage,
  flushPreviewDisplaySettings,
} from './preview-bar-manager';
import {
  PREVIEW_PARAM_ID,
  PREVIEW_SETTINGS_PARAM,
  withPreviewSession,
} from '../utilities/preview-mode';
import type { GistMessage, DisplaySettings, MessageProperties } from '../types';

interface GistEventData {
  gist?: {
    method: string;
    instanceId: string;
    parameters: Record<string, unknown>;
  };
}

const defaultSnoozeDurationInMinutes = 60;

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
  const targetSelector = properties.elementId || message.elementId;
  const isLivePreview = Gist.config.isPreviewSession && message.properties?.gist?.livePreview;

  // In live preview we load the message even when the target is missing or not
  // yet set, so the preview bar renders and the author can pick a target. A
  // real session can't show a tooltip without one, so it errors out.
  if (!targetSelector) {
    if (!isLivePreview) {
      log(`No target selector specified for tooltip message ${message.messageId}`);
      Gist.messageError(message);
      return null;
    }
    log(`Preview: no tooltip target yet, loading message for preview bar`);
  } else if (!findElement(targetSelector)) {
    if (!isLivePreview) {
      log(
        `Tooltip target element "${targetSelector}" not found for message ${message.messageId}, skipping display`
      );
      Gist.messageError(message);
      return null;
    }
    log(`Preview: tooltip target "${targetSelector}" not found, loading message for preview bar`);
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

  message.elementId = targetSelector;

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

  let url = `${settings.GIST_VIEW_ENDPOINT[env]}/index.html`;
  if (typeof window !== 'undefined' && window.crossOriginIsolated) {
    // The coi flag makes the CDN serve the renderer with the CORP/COEP headers
    // required for embedding inside cross-origin-isolated (COOP+COEP) pages.
    url = `${url}?coi=1`;
    log('Cross-origin-isolated page detected, requesting renderer with COEP headers');
  }
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

// Whether a (possibly relative) target resolves to an http(s) URL — the only
// scheme family navigateToPage will navigate to. Checked up front by the
// cross-page step flow so a refused target degrades to a local step change.
function isHttpNavigable(url: string): boolean {
  try {
    const protocol = new URL(url, window.location.href).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

// Whether a (possibly relative) navigation target resolves to the same origin
// as the current page. Used to decide if the preview-session token is safe to
// carry across a hop — appending it to a cross-origin destination would leak
// the preview credential to a third-party host. Derives the current origin from
// window.location.href (not window.location.origin) so it resolves correctly
// even against relative targets.
function isSameOriginAsCurrent(url: string): boolean {
  try {
    const current = new URL(window.location.href);
    const destination = new URL(url, window.location.href);
    return destination.origin === current.origin;
  } catch {
    // Unparseable target: treat as cross-origin so we never risk leaking the token.
    return false;
  }
}

// Shared by loadPage taps and cross-page step navigation: absolute http(s),
// mailto and root-relative paths navigate as-is; anything else resolves
// against the current location.
function navigateToPage(url: string): void {
  if (
    url.startsWith('mailto:') ||
    url.startsWith('https://') ||
    url.startsWith('http://') ||
    url.startsWith('/')
  ) {
    window.location.href = url;
    return;
  }
  // Resolve bare-relative targets against the current location the same way
  // matchesPageUrl and withPreviewSession do (new URL(url, base)), so a
  // relative page-url navigates to a URL the restore-side gate can match.
  // Only an http(s) result may navigate: resolution keeps absolute schemes
  // verbatim, so without the protocol guard a crafted `javascript:` target
  // would execute in the host page — the legacy string concat this replaced
  // was accidentally inert against that, and it must stay inert.
  try {
    const destination = new URL(url, window.location.href);
    if (destination.protocol === 'https:' || destination.protocol === 'http:') {
      window.location.href = destination.href;
    } else {
      log(`Refusing to navigate to non-http(s) target: ${url}`);
    }
  } catch {
    log(`Refusing to navigate to unparseable target: ${url}`);
  }
}

// Re-check the queue when a snooze lapses so a tab that just stays open
// re-shows the message on time. Longer snoozes overflow setTimeout's int32
// range and are picked up by the regular queue checks instead (polling,
// route and visibility changes, page loads).
function scheduleSnoozeWakeup(showInMinutes: number): void {
  const delayMs = showInMinutes * 60 * 1000;
  if (delayMs > 2 ** 31 - 1) return;
  setTimeout(() => {
    void checkMessageQueue();
  }, delayMs);
}

async function handleGistEvents(e: MessageEvent): Promise<void> {
  const env = Gist.config.env as keyof typeof settings.RENDERER_HOST;
  const data = e.data as GistEventData;
  if (data.gist && e.origin === settings.RENDERER_HOST[env]) {
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
            const targetFound = !!targetSelector && !!findElement(targetSelector);
            if (!targetFound) {
              const isLivePreview =
                Gist.config.isPreviewSession && currentMessage.properties?.gist?.livePreview;
              if (isLivePreview) {
                log(
                  `Preview: tooltip target "${targetSelector}" not found, preview bar will show element picker`
                );
                currentMessage.firstLoad = false;
                currentMessage.isDisplayChange = false;
                break;
              }
              log(
                `Tooltip target not found for "${targetSelector}", emitting error and skipping display`
              );
              Gist.messageError(currentMessage);
              currentMessage.firstLoad = false;
              currentMessage.isDisplayChange = false;
              resetTooltipState(currentMessage);
              break;
            }
            const tooltipVisible = await showTooltipComponent(currentMessage);
            if (!tooltipVisible) {
              const isLivePreview =
                Gist.config.isPreviewSession && currentMessage.properties?.gist?.livePreview;
              if (isLivePreview) {
                log(
                  `Preview: tooltip positioning failed for "${targetSelector}", preview bar will remain active`
                );
                currentMessage.firstLoad = false;
                currentMessage.isDisplayChange = false;
                break;
              }
              log(
                `Tooltip positioning failed for "${targetSelector}", emitting error and cleaning up`
              );
              Gist.messageError(currentMessage);
              currentMessage.firstLoad = false;
              currentMessage.isDisplayChange = false;
              resetTooltipState(currentMessage);
              break;
            }
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
              case 'snooze': {
                const parsedShowIn = Number.parseInt(
                  actionUrl.searchParams.get('showIn') ?? '',
                  10
                );
                const showInMinutes =
                  Number.isFinite(parsedShowIn) && parsedShowIn > 0
                    ? parsedShowIn
                    : defaultSnoozeDurationInMinutes;
                if (messageProperties.persistent && currentMessage.queueId) {
                  // No removePersistentMessage here: skipping the view log
                  // keeps the server re-delivering the message (with its saved
                  // step state intact); the snoozed key hides it until it
                  // lapses.
                  await setMessageSnoozed(currentMessage.queueId, showInMinutes);
                  scheduleSnoozeWakeup(showInMinutes);
                } else {
                  log('Snooze is only supported for persistent queue messages, closing instead');
                  await removePersistentMessage(currentMessage);
                  await logBroadcastDismissedLocally(currentMessage);
                }
                await hideMessage(currentMessage);
                await checkMessageQueue();
                break;
              }
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
                  navigateToPage(redirectUrl);
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
      case 'stepChangeRequested': {
        // A tap targeted a step that declares a page-url; the renderer
        // withheld its local toggle and deferred the decision to us
        // (INAPP-14575). Either the step belongs to another page — persist it,
        // then navigate; the assignment only starts the navigation, so
        // awaiting the save keeps the order safe — or it belongs here and the
        // renderer is instructed to show it locally.
        const displaySettings = data.gist.parameters.displaySettings as DisplaySettings | undefined;
        const messageStepName = data.gist.parameters.messageStepName as string | undefined;
        if (!messageStepName) {
          // The renderer withheld its local toggle and deferred the step change
          // to us, but sent no target step name. We can't navigate or toggle a
          // specific step, so leave the currently shown step in place rather
          // than silently stranding the tour with no recovery.
          log(
            `stepChangeRequested for message ${currentMessage.messageId} arrived without a messageStepName; keeping the current step visible`
          );
          break;
        }
        const navigated = await navigateForCrossPageStep(
          currentMessage,
          messageStepName,
          displaySettings,
          (data.gist.parameters.name as string | undefined) ?? ''
        );
        if (!navigated) {
          log(`Step "${messageStepName}" stays on this page, instructing renderer to show it`);
          sendShowStepToIframe(
            currentMessage,
            messageStepName,
            data.gist.parameters.requestId as number | undefined
          );
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

/**
 * Cross-page step routing (INAPP-14575), shared by the button-tap
 * `stepChangeRequested` handler and the preview bar's step switcher. If the
 * target step belongs to a different page, it persists the step and navigates
 * (rehearsing the hop with the preview session in preview mode) and returns
 * true. Otherwise it returns false and the caller performs its normal in-place
 * step change.
 */
export async function navigateForCrossPageStep(
  message: GistMessage,
  stepName: string,
  displaySettings: DisplaySettings | undefined,
  trackingName = ''
): Promise<boolean> {
  const stepPageUrl = displaySettings?.pageUrl;
  if (!stepPageUrl || matchesPageUrl(stepPageUrl)) {
    return false;
  }

  // Gate on navigability BEFORE dispatching analytics or saving state: a
  // target navigateToPage would refuse (non-http(s), e.g. javascript: or
  // unparseable garbage) must degrade to a local step change, not a dead tap
  // with a phantom loadPage action and poisoned saved state.
  if (!isHttpNavigable(stepPageUrl)) {
    log(
      `Step "${stepName}" page-url is not a navigable http(s) target (${stepPageUrl}); treating as a local step change`
    );
    return false;
  }

  const messageProperties = resolveMessageProperties(message);
  // Parity with plain openUrl buttons: the navigation surfaces as the same
  // loadPage message action.
  Gist.messageAction(message, `gist://loadPage?url=${stepPageUrl}`, trackingName);
  if (messageProperties.persistent || isShowAlwaysBroadcast(message)) {
    log(`Saving step "${stepName}" before navigating to ${stepPageUrl}`);
    try {
      await saveMessageState(message.queueId ?? '', stepName, displaySettings);
    } catch (error) {
      // Losing the resume state is better than a dead tap (the navigation
      // would otherwise be swallowed by the rejection) — log and navigate
      // anyway, same philosophy as the preview flush below.
      log(`Failed to save step state before navigating: ${error}`);
    }
  }
  if (Gist.config.isPreviewSession) {
    // Flush any pending per-step settings edit so it isn't lost to the
    // navigation aborting the in-flight save, then rehearse the real hop.
    await flushPreviewDisplaySettings();
    if (isSameOriginAsCurrent(stepPageUrl)) {
      // Same-origin: carry the preview params so the destination re-bootstraps
      // the preview bar and restores the saved step exactly like production.
      window.location.href = withPreviewSession(
        stepPageUrl,
        stepName,
        displaySettings?.displayType
      );
    } else {
      // Cross-origin destination: never hand the preview-session token to a
      // third-party host. Navigate plainly, exactly like a normal loadPage tap.
      log(
        `Preview: step "${stepName}" targets a different origin (${stepPageUrl}); navigating without the preview session token`
      );
      navigateToPage(stepPageUrl);
    }
  } else {
    navigateToPage(stepPageUrl);
  }
  return true;
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
