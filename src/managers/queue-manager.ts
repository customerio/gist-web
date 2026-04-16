import Gist from '../gist';
import { log } from '../utilities/log';
import { getUserToken, isAnonymousUser } from './user-manager';
import { getUserQueue, getQueueSSEEndpoint } from '../services/queue-service';
import { showMessage, embedMessage, resetMessage } from './message-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import { positions } from './page-component-manager';
import {
  clearKeyFromLocalStore,
  getKeyFromLocalStore,
  STORAGE_KEYS,
} from '../utilities/local-storage';
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
} from './message-user-queue-manager';
import { updateInboxMessagesLocalStore } from './inbox-message-manager';
import type { InboxMessage } from './inbox-message-manager';
import { settings } from '../services/settings';
import { applyDisplaySettings } from '../utilities/message-utils';
import { findElement } from '../utilities/dom';
import type { GistMessage, DisplaySettings } from '../types';

const sleep = (time: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, time));
const poll = (promiseFn: () => Promise<unknown>, time: number): Promise<unknown> =>
  promiseFn().then(
    sleep(time).then(() => poll(promiseFn, time)) as unknown as (value: unknown) => unknown
  );

let pollingSetup = false;
let sseSource: EventSource | null = null;

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

export async function checkCurrentMessagesAfterRouteChange(): Promise<void> {
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
  let messageProperties = resolveMessageProperties(message);
  if (messageProperties.hasRouteRule) {
    let currentUrl = Gist.currentRoute;
    if (currentUrl == null) {
      currentUrl = new URL(window.location.href).pathname;
    }
    const routeRule = messageProperties.routeRule;
    log(`Verifying route ${currentUrl} against rule: ${routeRule}`);
    const urlTester = new RegExp(routeRule);
    if (!urlTester.test(currentUrl)) {
      log(`Route ${currentUrl} does not match rule.`);
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
      log(`Restoring saved state for queueId ${message.queueId}`);
      if (savedState.displaySettings) {
        applyDisplaySettings(message, savedState.displaySettings);
        messageProperties = resolveMessageProperties(message);
      }
      message.savedStepName = savedState.stepName ?? null;
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
      if (getKeyFromLocalStore(STORAGE_KEYS.userQueueNextPullCheck) === null) {
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

    clearKeyFromLocalStore(STORAGE_KEYS.userQueueNextPullCheck);
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
