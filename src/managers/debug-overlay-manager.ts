import Gist from '../gist';
import { el, findElement, injectStylesheet, appendToBody } from '../utilities/dom';
import { DEBUG_OVERLAY_CSS } from './debug-overlay-styles';
import { getMessagesFromLocalStore } from './message-user-queue-manager';
import { getEligibleBroadcasts } from './message-broadcast-manager';
import { getUserToken, isUsingGuestUserToken } from './user-manager';
import { settings } from '../services/settings';
import { getPollingIntervalSeconds } from '../services/queue-service';
import {
  mapElementIdToOverlayPosition,
  getCurrentDisplayType,
  matchesRouteRule,
} from '../utilities/message-utils';

import type { GistMessage } from '../types';

const STYLE_ID = 'gist-debug-overlay-styles';
const SETUP_POLL_MS = 2000;
const FALLBACK_POLL_MS = 5000;

interface OverlayRefs {
  root: HTMLElement;
  configRows: HTMLElement;
  configDetail: HTMLElement;
  userValue: HTMLElement;
  routeValue: HTMLElement;
  routeDetail: HTMLElement;
  messagesLabel: HTMLElement;
  messagesList: HTMLElement;
}

let refs: OverlayRefs | null = null;
let eventsSubscribed = false;
let refreshing = false;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

function getDebugDisplayType(msg: GistMessage): ReturnType<typeof getCurrentDisplayType> {
  const gist = msg.properties?.gist;
  if (!gist) return getCurrentDisplayType(msg);
  return getCurrentDisplayType({
    ...msg,
    tooltipPosition: gist.tooltipPosition ?? msg.tooltipPosition,
    elementId: gist.elementId != null ? String(gist.elementId) : msg.elementId,
  });
}

function msgProps(msg: GistMessage): Array<[string, string]> {
  const gist = msg.properties?.gist;
  const pairs: Array<[string, string]> = [];
  if (gist?.routeRuleWeb) pairs.push(['Route Rule', String(gist.routeRuleWeb)]);
  const elementId = gist?.elementId ?? msg.elementId;
  const displayType = getDebugDisplayType(msg);
  if (elementId && displayType === 'overlay') {
    const overlayPosition = mapElementIdToOverlayPosition(String(elementId));
    if (overlayPosition)
      pairs.push(['Position', overlayPosition.replace(/([A-Z])/g, ' $1').toLowerCase()]);
  } else if (elementId && displayType !== 'modal') {
    pairs.push(['Target', String(elementId)]);
  }
  const position = gist?.position ?? msg.position;
  if (position && displayType !== 'overlay') pairs.push(['Position', String(position)]);
  const tooltip = gist?.tooltipPosition ?? msg.tooltipPosition;
  if (tooltip) pairs.push(['Tooltip', String(tooltip)]);
  return pairs;
}

function buildKvRow(key: string, value: string, error = false): HTMLElement {
  const row = el('div', { className: 'gist-debug-msg-row' });
  row.appendChild(el('span', { className: 'gist-debug-msg-key', textContent: key }));
  row.appendChild(
    el('span', {
      className: error ? 'gist-debug-msg-val gist-debug-val-error' : 'gist-debug-msg-val',
      textContent: value,
    })
  );
  return row;
}

function renderKv(container: HTMLElement, pairs: Array<[string, string]>, error = false): void {
  container.replaceChildren(...pairs.map(([key, value]) => buildKvRow(key, value, error)));
}

function buildMessageEl(msg: GistMessage, state: 'active' | 'queued'): HTMLElement {
  const item = el('div', { className: 'gist-debug-msg' });
  const meta = el('div', { className: 'gist-debug-msg-meta' });
  meta.appendChild(
    el('span', { className: 'gist-debug-msg-type', textContent: getDebugDisplayType(msg) })
  );
  meta.appendChild(
    el('span', {
      className: `gist-debug-msg-state gist-debug-msg-state--${state}`,
      textContent: state,
    })
  );
  if (msg.instanceId) {
    const dismiss = el('button', { className: 'gist-debug-msg-dismiss', textContent: '×' });
    dismiss.addEventListener('click', () => {
      refreshSync();
      void Gist.dismissMessage(msg.instanceId!).then(() => {
        refreshSync();
        void refreshMessages();
      });
    });
    meta.appendChild(dismiss);
  }
  item.appendChild(meta);

  const inlineDetails: string[] = [];

  for (const [key, value] of msgProps(msg)) {
    let statusClass: string | null = null;
    let statusText: string | null = null;

    if (key === 'Route Rule') {
      const mismatch = !matchesRouteRule(value);
      statusClass = mismatch ? 'gist-debug-route-mismatch' : 'gist-debug-element-found';
      statusText = mismatch ? '✕' : '✓';
      if (mismatch)
        inlineDetails.push(
          'Route rule does not match current route. If it should, verify the route is set correctly and that analytics.page() is called on route changes.'
        );
    } else if (key === 'Target') {
      const exists = !!findElement(value);
      statusClass = exists ? 'gist-debug-element-found' : 'gist-debug-route-mismatch';
      statusText = exists ? '✓' : '✕';
      if (!exists)
        inlineDetails.push(
          'Target element not found on the page. If it should, verify the selector is correct.'
        );
    }

    const row = buildKvRow(key, value);
    if (statusClass && statusText)
      row.appendChild(el('span', { className: statusClass, textContent: statusText }));
    item.appendChild(row);
  }

  if (inlineDetails.length > 0) {
    const detailList = el('ul', { className: 'gist-debug-msg-details' });
    for (const text of inlineDetails) {
      detailList.appendChild(el('li', { textContent: text }));
    }
    item.appendChild(detailList);
  }

  return item;
}

function buildDetailPanel(text: string): HTMLElement {
  const detail = el('div', { className: 'gist-debug-expand-detail' });
  const list = el('ul', { className: 'gist-debug-expand-list' });
  list.appendChild(el('li', { textContent: text }));
  detail.appendChild(list);
  return detail;
}

function buildOverlay(): OverlayRefs {
  const root = el('div', { id: 'gist-debug-overlay' });

  const header = el('div', { className: 'gist-debug-header' });
  header.appendChild(
    el('span', {
      className: 'gist-debug-title',
      textContent: 'Customer.io In-App SDK Debugger',
    })
  );
  const closeBtn = el('button', {
    id: 'gist-debug-overlay-close',
    ariaLabel: 'Dismiss debug overlay',
    textContent: '×',
  });
  closeBtn.addEventListener('click', teardown);
  header.appendChild(closeBtn);
  root.appendChild(header);

  // Config
  const configSection = el('div', { className: 'gist-debug-section' });
  const configLabel = el('div', { className: 'gist-debug-label' });
  configLabel.appendChild(el('span', { textContent: 'Config' }));
  configSection.appendChild(configLabel);
  const configRows = el('div', {});
  configSection.appendChild(configRows);
  const configDetail = buildDetailPanel('Verify your site ID and credentials are correct.');
  configSection.appendChild(configDetail);
  root.appendChild(configSection);

  // User
  const userSection = el('div', { className: 'gist-debug-section' });
  const userLabel = el('div', { className: 'gist-debug-label', textContent: 'User' });
  userSection.appendChild(userLabel);
  const userValue = el('div', { className: 'gist-debug-value' });
  userSection.appendChild(userValue);
  root.appendChild(userSection);

  // Route
  const routeSection = el('div', { className: 'gist-debug-section' });
  const routeLabel = el('div', { className: 'gist-debug-label' });
  routeLabel.appendChild(el('span', { textContent: 'Route' }));
  routeSection.appendChild(routeLabel);
  const routeValue = el('div', { className: 'gist-debug-value' });
  routeSection.appendChild(routeValue);
  const routeDetail = buildDetailPanel(
    'The current route is used to match against potential message page rules.'
  );
  routeSection.appendChild(routeDetail);
  root.appendChild(routeSection);

  // Messages
  const messagesSection = el('div', { className: 'gist-debug-section' });
  const messagesLabel = el('div', { className: 'gist-debug-label' });
  messagesSection.appendChild(messagesLabel);
  const messagesList = el('div', {});
  messagesSection.appendChild(messagesList);
  root.appendChild(messagesSection);

  return {
    root,
    configRows,
    configDetail,
    userValue,
    routeValue,
    routeDetail,
    messagesLabel,
    messagesList,
  };
}

function teardown(): void {
  if (!refs) return;
  refs.root.remove();
  document.getElementById(STYLE_ID)?.remove();
  if (pollIntervalId !== null) {
    clearInterval(pollIntervalId);
    pollIntervalId = null;
  }
  unsubscribeEvents();
  refs = null;
}

function refreshSync(): void {
  if (!refs) return;

  if (!Gist.config) {
    renderKv(refs.configRows, [['Status', 'NOT INITIALIZED']], true);
  } else {
    renderKv(refs.configRows, [
      ['Site ID', Gist.config.siteId],
      ['Connection', settings.useSSE() ? 'SSE' : `Polling ${getPollingIntervalSeconds()}s`],
    ]);
  }
  refs.configDetail.style.display = Gist.config ? 'none' : '';

  const token = getUserToken();
  if (!token) {
    refs.userValue.textContent = '(none)';
  } else if (isUsingGuestUserToken()) {
    refs.userValue.textContent = '(anonymous)';
  } else {
    refs.userValue.textContent = token.length > 32 ? `${token.slice(0, 32)}…` : token;
  }

  const route = Gist.currentRoute;
  refs.routeValue.replaceChildren(
    el('span', {
      className: route ? 'gist-debug-msg-val' : 'gist-debug-msg-val gist-debug-val-error',
      textContent: route ?? 'NONE',
    })
  );
  refs.routeDetail.style.display = route ? 'none' : '';
}

async function refreshMessages(): Promise<void> {
  if (refreshing || !refs) return;

  refreshing = true;
  try {
    const active = Gist.currentMessages ?? [];
    const [userMsgs, broadcasts] = Gist.config
      ? await Promise.all([getMessagesFromLocalStore(), getEligibleBroadcasts()])
      : [[], []];
    const activeIds = new Set(active.map((m) => m.queueId ?? m.messageId));
    const seen = new Set<string>();
    const queued = [...broadcasts, ...userMsgs].filter((m) => {
      const id = m.queueId ?? m.messageId;
      if (activeIds.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (!refs) return;

    const total = active.length + queued.length;

    refs.messagesLabel.textContent = `Messages (${total})`;
    refs.messagesList.replaceChildren(
      ...active.map((msg) => buildMessageEl(msg, 'active')),
      ...queued.map((msg) => buildMessageEl(msg, 'queued'))
    );
  } finally {
    refreshing = false;
  }
}

function onMessageChanged(): void {
  refreshSync();
  void refreshMessages();
}

function onInboxUpdated(): void {
  void refreshMessages();
}

function subscribeEvents(): void {
  if (eventsSubscribed || !Gist.events) return;
  Gist.events.on('messageShown', onMessageChanged);
  Gist.events.on('messageDismissed', onMessageChanged);
  Gist.events.on('messageInboxUpdated', onInboxUpdated);
  Gist.events.on('routeChanged', onMessageChanged);

  eventsSubscribed = true;
}

function unsubscribeEvents(): void {
  if (!eventsSubscribed) return;
  if (Gist.events) {
    Gist.events.off('messageShown', onMessageChanged);
    Gist.events.off('messageDismissed', onMessageChanged);
    Gist.events.off('messageInboxUpdated', onInboxUpdated);
    Gist.events.off('routeChanged', onMessageChanged);
  }
  eventsSubscribed = false;
}

async function refreshAll(): Promise<void> {
  if (!eventsSubscribed) {
    subscribeEvents();
    if (eventsSubscribed) reschedulePoll(FALLBACK_POLL_MS);
  }
  refreshSync();
  await refreshMessages();
}

function reschedulePoll(intervalMs: number): void {
  if (pollIntervalId !== null) clearInterval(pollIntervalId);
  pollIntervalId = setInterval(() => void refreshAll(), intervalMs);
}

export function initDebugOverlay(): void {
  if (refs || pollIntervalId !== null) return;
  injectStylesheet(STYLE_ID, DEBUG_OVERLAY_CSS);
  refs = buildOverlay();
  appendToBody(refs.root);
  reschedulePoll(SETUP_POLL_MS);
  void refreshAll();
}
