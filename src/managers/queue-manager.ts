import Gist from '../gist';
import { log } from '../utilities/log';
import { getUserToken, isAnonymousUser } from './user-manager';
import {
  getUserQueue,
  getQueueSSEEndpoint,
  userQueueNextPullCheckLocalStoreName,
} from '../services/queue-service';
import { showMessage, embedMessage, resetMessage } from './message-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import { positions } from './page-component-manager';
import { clearKeyFromLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import {
  updateBroadcastsLocalStore,
  getEligibleBroadcasts,
  isShowAlwaysBroadcast,
} from './message-broadcast-manager';
import {
  updateQueueLocalStore,
  getMessagesFromLocalStore,
  isMessageLoading,
  setMessageLoading,
  getSavedMessageState,
  isMessageSnoozed,
} from './message-user-queue-manager';
import { updateInboxMessagesLocalStore } from './inbox-message-manager';
import type { InboxMessage } from './inbox-message-manager';
import { settings } from '../services/settings';
import { applyDisplaySettings, matchesPageUrl, matchesRouteRule } from '../utilities/message-utils';
import { findElement, waitForElement } from '../utilities/dom';
import type { GistMessage, DisplaySettings } from '../types';

const sleep = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));
const poll = (promiseFn: () => Promise<unknown>, time: number): Promise<unknown> =>
  promiseFn().then(
    sleep(time).then(() => poll(promiseFn, time)) as unknown as (value: unknown) => unknown
  );

let pollingSetup = false;
let sseSource: EventSource | null = null;

const CONTINUATION_ANCHOR_WAIT_MS = 10000;
const pendingAnchorWaits = new Set<string>();
// queueId → pathname where the anchor wait already timed out. Without this,
// every queue re-check (SSE poll ~1s, each route change) would re-arm a fresh
// 10s wait and re-emit messageError forever while the visitor sits on a page
// whose anchor never renders. Keyed by pathname so a genuine arrival on a
// different page is still treated as a fresh attempt; cleared once the anchor
// finally appears. One entry per tour message, so it stays small.
const abandonedAnchorWaits = new Map<string, string>();

/**
 * The app-rendered element a continuation (restored step) must anchor to:
 * the tooltip target, or the embed target for inline messages. Overlay
 * positions are SDK-created containers, never app-rendered anchors.
 */
function continuationAnchorSelector(
  message: GistMessage,
  messageProperties: ReturnType<typeof resolveMessageProperties>
): string | null {
  let selector: string | null | undefined = null;
  if (messageProperties.hasTooltipPosition || message.tooltipPosition) {
    selector = messageProperties.elementId || message.elementId;
  } else if (messageProperties.isEmbedded) {
    selector = messageProperties.elementId;
  }
  if (!selector || positions.includes(selector)) {
    return null;
  }
  return selector;
}

function waitForContinuationAnchor(message: GistMessage, selector: string): void {
  const queueId = message.queueId ?? '';
  const pathname = new URL(window.location.href).pathname;
  if (pendingAnchorWaits.has(queueId)) {
    return;
  }
  // Already gave up on this exact page — don't re-arm or re-error until the
  // visitor moves to a different page.
  if (abandonedAnchorWaits.get(queueId) === pathname) {
    return;
  }
  pendingAnchorWaits.add(queueId);
  log(
    `Anchor "${selector}" not present for saved step "${message.savedStepName}" of queueId ${queueId}, waiting up to ${CONTINUATION_ANCHOR_WAIT_MS}ms`
  );
  waitForElement(selector, CONTINUATION_ANCHOR_WAIT_MS)
    .then(async (element) => {
      pendingAnchorWaits.delete(queueId);
      if (element) {
        abandonedAnchorWaits.delete(queueId);
        log(`Anchor "${selector}" appeared, re-checking message queue`);
        await checkMessageQueue();
        return;
      }
      // The visitor left the page while the wait was in flight: the tour is
      // merely deferred to its own page, not in error — and an abandonment
      // entry for a page we're no longer on would be stale on arrival.
      const currentPathname = new URL(window.location.href).pathname;
      if (currentPathname !== pathname) {
        log(
          `Anchor wait for "${selector}" outlived ${pathname} (now on ${currentPathname}), ignoring`
        );
        return;
      }
      abandonedAnchorWaits.set(queueId, pathname);
      log(
        `Anchor "${selector}" did not appear within ${CONTINUATION_ANCHOR_WAIT_MS}ms, tour step for queueId ${queueId} cannot continue on ${pathname}`
      );
      Gist.messageError(message);
    })
    .catch((error) => {
      pendingAnchorWaits.delete(queueId);
      log(`Anchor wait for "${selector}" failed: ${error}`);
    });
}

export async function startQueueListener(): Promise<void> {
  if (!pollingSetup) {
    if (getUserToken()) {
      log('Queue watcher started');
      pollingSetup = true;
      poll(
        () =>
          new Promise(() => {
            void pullMessagesFromQueue();
          }),
        1000
      );
    } else {
      log('User token not setup, queue not started.');
    }
  } else {
    await checkMessageQueue();
  }
}

export async function checkMessageQueue(): Promise<void> {
  const broadcastMessages = await getEligibleBroadcasts();
  const userMessages = await getMessagesFromLocalStore();
  const allMessages = broadcastMessages.concat(userMessages);

  log(`Messages in local queue: ${allMessages.length}`);
  const orderedMessages = allMessages.sort(
    (a, b) =>
      (a as GistMessage & { priority: number }).priority -
      (b as GistMessage & { priority: number }).priority
  );
  for (const message of orderedMessages) {
    await handleMessage(message);
  }
}

// On navigate-away, drop any abandonment recorded for a page we've left so a
// return visit re-arms the anchor wait. Without this, an entry keyed to a page
// whose anchor never rendered survives the hop, and coming back makes
// waitForContinuationAnchor exit early forever — the saved step never retries.
// Entries recorded for the current page are kept so we don't re-arm/re-error in
// a loop while the visitor is still sitting on that page (INAPP-14575).
function clearAbandonedAnchorWaitsOnNavigation(): void {
  const currentPathname = new URL(window.location.href).pathname;
  for (const [queueId, pathname] of abandonedAnchorWaits) {
    if (pathname !== currentPathname) {
      abandonedAnchorWaits.delete(queueId);
    }
  }
}

export async function checkCurrentMessagesAfterRouteChange(): Promise<void> {
  clearAbandonedAnchorWaitsOnNavigation();

  if (Gist.currentMessages.length === 0) {
    return;
  }

  for (const message of [...Gist.currentMessages]) {
    if (document.querySelector(`#gist-${message.instanceId}`) == null) {
      log(`Removing active message ${message.instanceId} that no longer exists after route change`);
      await resetMessage(message);
    }
  }
}

// TODO: Move this to a utility and only return valid messages (from: getEligibleBroadcasts getMessagesFromLocalStore) & to handleMessage
export async function handleMessage(message: GistMessage): Promise<boolean> {
  if (message.queueId && (await isMessageSnoozed(message.queueId))) {
    log(`Not showing message with queueId ${message.queueId} because it is snoozed.`);
    return false;
  }

  let messageProperties = resolveMessageProperties(message);
  if (messageProperties.hasRouteRule) {
    if (Gist.currentRoute == null && !Gist.routeInitialized) {
      log(`Deferring message ${message.queueId}, route not yet initialized`);
      return false;
    }

    if (!matchesRouteRule(messageProperties.routeRule)) {
      log(
        `Route ${new URL(window.location.href).pathname} (currentRoute: ${Gist.currentRoute}) does not match rule: ${messageProperties.routeRule}`
      );
      return false;
    }
  }

  if (messageProperties.hasPosition) {
    message.position = messageProperties.position;
  }

  if (messageProperties.hasTooltipPosition) {
    message.tooltipPosition = messageProperties.tooltipPosition;
  }

  if (messageProperties.persistent || isShowAlwaysBroadcast(message)) {
    const savedState = (await getSavedMessageState(message.queueId ?? '')) as {
      stepName?: string;
      displaySettings?: DisplaySettings;
    } | null;
    if (savedState) {
      // Cross-page tours: the saved step belongs to a specific page. Anywhere
      // else, keep the message queued and wait — every route change re-checks
      // the queue, so the tour resumes when the visitor reaches that page
      // (INAPP-14575).
      const savedPageUrl = savedState.displaySettings?.pageUrl;
      if (savedPageUrl && !matchesPageUrl(savedPageUrl)) {
        log(
          `Saved step for queueId ${message.queueId} belongs to page ${savedPageUrl}, not showing on ${new URL(window.location.href).pathname}`
        );
        return false;
      }
      log(`Restoring saved state for queueId ${message.queueId}`);
      if (savedState.displaySettings) {
        applyDisplaySettings(message, savedState.displaySettings);
        messageProperties = resolveMessageProperties(message);
      }
      message.savedStepName = savedState.stepName ?? null;
    }
  }

  // Tour continuation: tooltip/inline steps need their anchor element, and
  // right after a cross-page hop the queue check usually beats the app
  // rendering it — especially on SPAs. Wait for the anchor (bounded) instead
  // of erroring the message out (INAPP-14575).
  if (message.savedStepName) {
    const anchorSelector = continuationAnchorSelector(message, messageProperties);
    if (anchorSelector && !findElement(anchorSelector)) {
      const isLivePreview = Gist.config.isPreviewSession && message.properties?.gist?.livePreview;
      if (!isLivePreview) {
        waitForContinuationAnchor(message, anchorSelector);
        return false;
      }
    }
  }

  if (
    !messageProperties.persistent &&
    !isShowAlwaysBroadcast(message) &&
    (await isMessageLoading(message.queueId ?? ''))
  ) {
    log(`Not showing message with queueId ${message.queueId} because its already loading.`);
    return false;
  } else {
    let result: GistMessage | null = null;
    if (messageProperties.isEmbedded) {
      const isLivePreview = Gist.config.isPreviewSession && message.properties?.gist?.livePreview;
      if (
        isLivePreview &&
        !findElement(messageProperties.elementId) &&
        !positions.includes(messageProperties.elementId)
      ) {
        log(
          `Preview: element "${messageProperties.elementId}" not found, showing as overlay so placement can be changed`
        );
        result = await showMessage(message);
      } else {
        result = embedMessage(message, messageProperties.elementId);
      }
    } else {
      result = await showMessage(message);
    }
    if (result) setMessageLoading(message.queueId ?? '');
    return result !== null;
  }
}

export async function pullMessagesFromQueue(): Promise<void> {
  if (settings.hasActiveSSEConnection()) {
    if (!settings.isSSEConnectionManagedBySDK() && sseSource) {
      log('Not the main instance, closing our SSE connection.');
      stopSSEListener();
    }
    await checkMessageQueue();
    return;
  } else {
    if (sseSource) {
      log('SSE connection not active, closing it.');
      stopSSEListener();
    }
  }

  if (settings.useSSE() && !isAnonymousUser()) {
    await setupSSEQueueListener();
    return;
  }

  await checkQueueThroughPolling();
}

async function checkQueueThroughPolling(): Promise<void> {
  if (getUserToken()) {
    if (Gist.isDocumentVisible) {
      if (getKeyFromLocalStore(userQueueNextPullCheckLocalStoreName) === null) {
        const response = await getUserQueue();
        if (response) {
          if (response.status === 200 || response.status === 204) {
            log('200 response, updating local store.');
            const data = response.data as
              | {
                  inAppMessages?: GistMessage[];
                  inboxMessages?: InboxMessage[];
                }
              | undefined;
            const inAppMessages = data?.inAppMessages ?? [];
            const inboxMessages = data?.inboxMessages ?? [];
            updateQueueLocalStore(inAppMessages);
            updateBroadcastsLocalStore(inAppMessages);
            updateInboxMessagesLocalStore(inboxMessages);
          } else if (response.status === 304) {
            log('304 response, using local store.');
          }
          await checkMessageQueue();
        } else {
          log(`No response object returned while checking message queue.`);
        }
      } else {
        log(`Next queue pull scheduled for later.`);
      }
    } else {
      log(`Document not visible, skipping queue check.`);
    }
  } else {
    log(`User token reset, skipping queue check.`);
  }
}

async function setupSSEQueueListener(): Promise<void> {
  stopSSEListener();

  const sseURL = getQueueSSEEndpoint();
  if (sseURL === null) {
    log('SSE endpoint not available, falling back to polling.');
    await checkQueueThroughPolling();
    return;
  }
  log(`Starting SSE queue listener on ${sseURL}`);
  sseSource = new EventSource(sseURL);
  settings.setActiveSSEConnection();

  sseSource.addEventListener('connected', async (event) => {
    try {
      log('SSE connection received');
      settings.setUseSSEFlag(true);
      const config = JSON.parse(event.data);
      if (config.heartbeat) {
        settings.setSSEHeartbeat(config.heartbeat);
        log(`SSE heartbeat set to ${config.heartbeat} seconds`);
      }
      settings.setActiveSSEConnection();
    } catch (e) {
      log(`Failed to parse SSE settings: ${e}`);
    }

    clearKeyFromLocalStore(userQueueNextPullCheckLocalStoreName);
    await checkQueueThroughPolling();
  });

  sseSource.addEventListener('messages', async (event) => {
    try {
      const messages = JSON.parse(event.data);
      log('SSE message received');
      await updateQueueLocalStore(messages);
      await updateBroadcastsLocalStore(messages);
      await checkMessageQueue();
    } catch (e) {
      log(`Failed to parse SSE message: ${e}`);
      stopSSEListener();
    }
  });

  sseSource.addEventListener('inbox_messages', async (event) => {
    try {
      const inboxMessages = JSON.parse(event.data);
      log('SSE inbox messages received');
      await updateInboxMessagesLocalStore(inboxMessages);
    } catch (e) {
      log(`Failed to parse SSE inbox messages: ${e}`);
    }
  });

  sseSource.addEventListener('error', async () => {
    log('SSE error received');
    stopSSEListener();
  });

  sseSource.addEventListener('heartbeat', async () => {
    log('SSE heartbeat received');
    settings.setActiveSSEConnection();
    settings.setUseSSEFlag(true);
  });
}

export function stopSSEListener(disconnectGlobally = false): void {
  if (disconnectGlobally) {
    settings.removeActiveSSEConnection();
  }

  if (disconnectGlobally || settings.isSSEConnectionManagedBySDK()) {
    settings.setUseSSEFlag(false);
  }

  if (!sseSource) {
    return;
  }

  log('Stopping SSE queue listener...');
  sseSource.close();
  sseSource = null;
}
