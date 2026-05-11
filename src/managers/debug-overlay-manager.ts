import Gist from '../gist';
import { el, injectStylesheet, appendToBody } from '../utilities/dom';
import { version as SDK_VERSION } from '../../package.json';
import { DEBUG_OVERLAY_CSS } from './debug-overlay-styles';
import { getMessagesFromLocalStore } from './message-user-queue-manager';
import { getEligibleBroadcasts } from './message-broadcast-manager';
import { getUserToken, isUsingGuestUserToken } from './user-manager';
import { positions } from './page-component-manager';
import { settings } from '../services/settings';
import { mapElementIdToOverlayPosition } from '../utilities/message-utils';

import type { GistMessage } from '../types';

const OVERLAY_ID = 'gist-debug-overlay';
const STYLE_ID = 'gist-debug-overlay-styles';
const POLL_INTERVAL_MS = 2000;

let eventsSubscribed = false;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

function getDebugDisplayType(msg: GistMessage): 'modal' | 'overlay' | 'inline' | 'tooltip' {
  const gist = msg.properties?.gist;
  const tooltipPos = gist?.tooltipPosition ?? msg.tooltipPosition;
  if (tooltipPos) return 'tooltip';
  const elementId = gist?.elementId ?? msg.elementId;
  if (elementId && positions.includes(String(elementId))) return 'overlay';
  if (elementId) return 'inline';
  return 'modal';
}

function formatOverlayPositionLabel(overlayPosition: string): string {
  return overlayPosition.replace(/([A-Z])/g, ' $1').toLowerCase();
}

function msgProps(msg: GistMessage): Array<[string, string]> {
  const gist = msg.properties?.gist;
  const pairs: Array<[string, string]> = [];
  if (gist?.routeRuleWeb) pairs.push(['route rule', String(gist.routeRuleWeb)]);
  const elementId = gist?.elementId ?? msg.elementId;
  const displayType = getDebugDisplayType(msg);
  if (elementId && displayType === 'overlay') {
    const overlayPosition = mapElementIdToOverlayPosition(String(elementId));
    if (overlayPosition) pairs.push(['position', formatOverlayPositionLabel(overlayPosition)]);
  } else if (elementId && displayType !== 'modal') {
    pairs.push(['target', String(elementId)]);
  }
  const position = gist?.position ?? msg.position;
  if (position && displayType !== 'overlay') pairs.push(['position', String(position)]);
  const tooltip = gist?.tooltipPosition ?? msg.tooltipPosition;
  if (tooltip) pairs.push(['tooltip', String(tooltip)]);
  return pairs;
}

function routeRuleMismatches(rule: string): boolean {
  try {
    const re = new RegExp(rule);
    const pathname = new URL(window.location.href).pathname;
    const matchesCurrent = Gist.currentRoute != null && re.test(Gist.currentRoute);
    const matchesPathname = Gist.currentRoute !== pathname && re.test(pathname);
    return !matchesCurrent && !matchesPathname;
  } catch {
    return false;
  }
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

    if (key === 'route rule') {
      const mismatch = routeRuleMismatches(value);
      statusClass = mismatch ? 'gist-debug-route-mismatch' : 'gist-debug-element-found';
      statusText = mismatch ? '✕' : '✓';
      if (mismatch)
        inlineDetails.push(
          'Route rule does not match current route. If it should, verify the route is set correctly and that analytics.page() is called on route changes.'
        );
    } else if (key === 'target') {
      const exists = !!(document.getElementById(value) ?? document.querySelector(value));
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

function buildExpandDetail(items: Array<string | Node[]>): HTMLElement {
  const detail = el('div', { className: 'gist-debug-expand-detail' });
  const list = el('ul', { className: 'gist-debug-expand-list' });
  for (const item of items) {
    const li = el('li', {});
    if (typeof item === 'string') {
      li.textContent = item;
    } else {
      for (const node of item)
        li.appendChild(node instanceof Node ? node : document.createTextNode(String(node)));
    }
    list.appendChild(li);
  }
  detail.appendChild(list);
  return detail;
}

function buildSection(labelId?: string, valueId?: string, listId?: string): HTMLElement {
  const section = el('div', { className: 'gist-debug-section' });
  if (labelId) section.appendChild(el('div', { className: 'gist-debug-label', id: labelId }));
  if (valueId) section.appendChild(el('div', { className: 'gist-debug-value', id: valueId }));
  if (listId) section.appendChild(el('div', { id: listId }));
  return section;
}

function buildOverlay(): HTMLElement {
  const overlay = el('div', { id: OVERLAY_ID });

  const header = el('div', { className: 'gist-debug-header' });
  header.appendChild(
    el('span', {
      className: 'gist-debug-title',
      textContent: `Customer.io In-App SDK ${SDK_VERSION}`,
    })
  );
  const closeBtn = el('button', {
    id: 'gist-debug-overlay-close',
    ariaLabel: 'Dismiss debug overlay',
    textContent: '×',
  });
  closeBtn.addEventListener('click', () => {
    overlay.remove();
    document.getElementById(STYLE_ID)?.remove();
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  });
  header.appendChild(closeBtn);
  overlay.appendChild(header);

  // Config section
  const configSection = el('div', { className: 'gist-debug-section' });
  const configLabel = el('div', { className: 'gist-debug-label' });
  configLabel.appendChild(el('span', { textContent: 'Config' }));
  configSection.appendChild(configLabel);
  configSection.appendChild(el('div', { id: 'gist-debug-config-rows' }));
  const configDetail = buildExpandDetail([
    "Ensure you're using the correct credentials in the SDK initialization snippet",
    'Ensure your credentials are active in Journeys',
  ]);
  configSection.appendChild(configDetail);
  overlay.appendChild(configSection);

  // User section
  overlay.appendChild(buildSection('gist-debug-user-label', 'gist-debug-user-value'));

  // Route section
  const routeSection = el('div', { className: 'gist-debug-section' });
  const routeLabel = el('div', { className: 'gist-debug-label' });
  routeLabel.appendChild(el('span', { textContent: 'Route' }));
  routeSection.appendChild(routeLabel);
  routeSection.appendChild(
    el('div', { className: 'gist-debug-value', id: 'gist-debug-route-value' })
  );
  const inlineCode = el('code', {
    className: 'gist-debug-inline-code',
    textContent: 'analytics.page()',
  });
  const routeDetail = buildExpandDetail([
    'The current route is used to match against message page rules if set.',
    [
      document.createTextNode('For single-page applications, ensure '),
      inlineCode,
      document.createTextNode(' is called on every route change'),
    ],
  ]);
  routeSection.appendChild(routeDetail);
  overlay.appendChild(routeSection);

  overlay.appendChild(
    buildSection('gist-debug-messages-label', undefined, 'gist-debug-messages-list')
  );
  return overlay;
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
  container.innerHTML = '';
  for (const [key, value] of pairs) container.appendChild(buildKvRow(key, value, error));
}

function refreshSync(): void {
  if (!document.getElementById(OVERLAY_ID)) return;

  // Config + init status
  const configRows = document.getElementById('gist-debug-config-rows');
  if (configRows) {
    if (!Gist.config) {
      renderKv(configRows, [['Status', 'NOT INITIALIZED']], true);
    } else {
      renderKv(configRows, [
        ['Status', 'INITIALIZED'],
        ['Connection', settings.useSSE() ? 'SSE' : 'polling'],
        ['Site ID', `${Gist.config.siteId.slice(0, 3)}…`],
      ]);
    }
  }

  // User
  const userLabel = document.getElementById('gist-debug-user-label');
  const userValue = document.getElementById('gist-debug-user-value');
  if (userLabel && userValue) {
    userLabel.textContent = 'User';
    const token = getUserToken();
    if (!token) {
      userValue.textContent = '(none)';
    } else if (isUsingGuestUserToken()) {
      userValue.textContent = '(anonymous)';
    } else {
      userValue.textContent = token.length > 32 ? `${token.slice(0, 32)}…` : token;
    }
  }

  // Route — value only, label and detail are static DOM from buildOverlay
  const routeValue = document.getElementById('gist-debug-route-value');
  if (routeValue) {
    const route = Gist.currentRoute;
    routeValue.innerHTML = '';
    routeValue.appendChild(
      el('span', {
        className: route ? 'gist-debug-msg-val' : 'gist-debug-msg-val gist-debug-val-error',
        textContent: route ?? 'NONE',
      })
    );
  }
}

async function refreshMessages(): Promise<void> {
  if (!document.getElementById(OVERLAY_ID)) return;
  const label = document.getElementById('gist-debug-messages-label');
  const list = document.getElementById('gist-debug-messages-list');
  if (!label || !list) return;

  const active = Gist.currentMessages ?? [];
  const [userMsgs, broadcasts] = Gist.config
    ? await Promise.all([getMessagesFromLocalStore(), getEligibleBroadcasts()])
    : [[], []];
  const queued = [...broadcasts, ...userMsgs];
  const total = active.length + queued.length;

  label.textContent = `Messages (${total})`;
  list.innerHTML = '';
  for (const msg of active) list.appendChild(buildMessageEl(msg, 'active'));
  for (const msg of queued) list.appendChild(buildMessageEl(msg, 'queued'));
}

// Lazily subscribe to Gist events and patch setCurrentRoute. Called on each
// poll tick until Gist.events is available (Gist.setup() may run after load).
function subscribeEvents(): void {
  if (eventsSubscribed || !Gist.events) return;
  Gist.events.on('messageShown', () => {
    refreshSync();
    void refreshMessages();
  });
  Gist.events.on('messageDismissed', () => {
    refreshSync();
    void refreshMessages();
  });
  Gist.events.on('messageInboxUpdated', () => {
    void refreshMessages();
  });

  // No route-changed event exists — intercept setCurrentRoute instead.
  const originalSetCurrentRoute = Gist.setCurrentRoute.bind(Gist);
  Gist.setCurrentRoute = async (route: string) => {
    await originalSetCurrentRoute(route);
    refreshSync();
    void refreshMessages();
  };

  eventsSubscribed = true;
}

async function refreshAll(): Promise<void> {
  subscribeEvents();
  refreshSync();
  await refreshMessages();
}

export function initDebugOverlay(): void {
  if (document.getElementById(OVERLAY_ID)) return;
  injectStylesheet(STYLE_ID, DEBUG_OVERLAY_CSS);
  const overlay = buildOverlay();
  appendToBody(overlay);
  void refreshAll();
  pollIntervalId = setInterval(() => void refreshAll(), POLL_INTERVAL_MS);
}
