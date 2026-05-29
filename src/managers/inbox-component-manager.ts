import Gist from '../gist';
import { el, injectStylesheet, appendToBody } from '../utilities/dom';
import { log } from '../utilities/log';
import { getBranding } from './branding-manager';
import { getTemplates } from './templates-manager';
import {
  getInboxMessagesFromLocalStore,
  updateInboxMessageOpenState,
  removeInboxMessage,
} from './inbox-message-manager';
import { getUserLocale } from './locale-manager';
import { INBOX_CSS } from './inbox-component-styles';
import type { InboxMessage } from './inbox-message-manager';
import type { InboxPattern, InboxActionConfig, InboxActionBehavior } from '../types';
import JistTemplateElement from '@customerio/jist';

const INBOX_STYLE_ID = 'gist-inbox-styles';
const BUTTON_ID = 'gist-inbox-button';
const BADGE_ID = 'gist-inbox-badge';
const PANEL_ID = 'gist-inbox-panel';
const MESSAGES_CONTAINER_ID = 'gist-inbox-messages';

let initialized = false;
let panelOpen = false;

export function resetInboxComponentState(): void {
  initialized = false;
  panelOpen = false;
}

export function initializeInboxComponent(): void {
  if (initialized) return;
  initialized = true;

  if (!customElements.get('jist-template')) {
    customElements.define('jist-template', JistTemplateElement);
  }

  injectStylesheet(INBOX_STYLE_ID, INBOX_CSS);

  Gist.events.on('messageInboxUpdated', (messages: unknown) => {
    void updateInbox(messages as InboxMessage[]);
  });

  void updateInbox();
}

export async function updateInbox(messages?: InboxMessage[]): Promise<void> {
  if (!messages) {
    messages = await getInboxMessagesFromLocalStore();
  }

  const inboxMessages = filterInboxMessages(messages);
  const branding = getBranding();
  const inboxPattern = branding?.patterns?.inbox;

  if (inboxMessages.length === 0 || !inboxPattern) {
    destroyInbox();
    return;
  }

  renderButton(inboxPattern, inboxMessages);

  if (panelOpen) {
    renderPanel(inboxPattern, inboxMessages);

    for (const message of inboxMessages) {
      if (!message.opened && message.queueId) {
        void updateInboxMessageOpenState(message.queueId, true);
      }
    }
  }
}

function filterInboxMessages(messages: InboxMessage[]): InboxMessage[] {
  return messages.filter((msg) => msg.topics?.some((t) => t.startsWith('cio_inbox')));
}

function renderButton(pattern: InboxPattern, messages: InboxMessage[]): void {
  let button = document.getElementById(BUTTON_ID);
  if (!button) {
    button = el('div', { id: BUTTON_ID });
    button.addEventListener('click', () => togglePanel());
    appendToBody(button);
  }

  const pos = positionStyles(pattern.position);
  button.style.background = pattern.floatingIcon.background;
  button.style.color = pattern.floatingIcon.color;
  button.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  Object.assign(button.style, pos);

  if (!button.querySelector('svg')) {
    button.insertAdjacentHTML('afterbegin', pattern.floatingIcon.svg);
  }

  const unopenedCount = messages.filter((m) => !m.opened).length;
  renderBadge(button, pattern, unopenedCount);
}

function renderBadge(button: HTMLElement, pattern: InboxPattern, count: number): void {
  let badge = document.getElementById(BADGE_ID);

  if (count === 0 || !pattern.unreadIndicator.showAlert) {
    badge?.remove();
    return;
  }

  if (!badge) {
    badge = el('span', { id: BADGE_ID });
    button.appendChild(badge);
  }

  const indicator = pattern.unreadIndicator;
  badge.textContent = String(count);
  badge.style.background = indicator.background;
  badge.style.color = indicator.text.color;
  badge.style.fontSize = `${indicator.text.fontSize}px`;
  badge.style.fontWeight = String(indicator.text.fontWeight);
  badge.style.fontFamily = indicator.text.fontFamily;
  badge.style.lineHeight = String(indicator.text.lineHeight);
}

function togglePanel(): void {
  if (panelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

function openPanel(): void {
  panelOpen = true;

  const branding = getBranding();
  const inboxPattern = branding?.patterns?.inbox;
  if (!inboxPattern) return;

  void getInboxMessagesFromLocalStore().then((messages) => {
    const inboxMessages = filterInboxMessages(messages);
    renderPanel(inboxPattern, inboxMessages);

    for (const message of inboxMessages) {
      if (!message.opened && message.queueId) {
        void updateInboxMessageOpenState(message.queueId, true);
      }
    }
  });
}

function closePanel(): void {
  panelOpen = false;
  document.getElementById(PANEL_ID)?.remove();
}

function renderPanel(pattern: InboxPattern, messages: InboxMessage[]): void {
  let panel = document.getElementById(PANEL_ID);

  if (!panel) {
    panel = el('div', { id: PANEL_ID });
    appendToBody(panel);
  }

  const pos = positionStyles(pattern.position, true);
  panel.style.background = pattern.background;
  panel.style.borderRadius = `${pattern.cornerRadius}px`;
  panel.style.border = `1px solid ${pattern.borderColor}`;
  panel.style.boxShadow = `${pattern.shadow.offsetX}px ${pattern.shadow.offsetY}px ${pattern.shadow.blur}px ${pattern.shadow.color}`;
  Object.assign(panel.style, pos);

  let container = document.getElementById(MESSAGES_CONTAINER_ID);
  if (!container) {
    container = el('div', { id: MESSAGES_CONTAINER_ID });
    panel.appendChild(container);
  }

  container.innerHTML = '';

  const branding = getBranding();
  const templates = getTemplates() as Record<string, unknown> | null;

  messages.forEach((message, index) => {
    const row = el('div', { className: 'gist-inbox-message-row' });
    row.style.padding = '12px 16px';
    row.style.cursor = 'pointer';
    row.addEventListener('mouseenter', () => {
      row.style.background = pattern.hoverBackground;
    });
    row.addEventListener('mouseleave', () => {
      row.style.background = '';
    });

    const jistEl = document.createElement('jist-template');

    row.appendChild(jistEl);
    container!.appendChild(row);

    const jist = jistEl as unknown as {
      template: string | null;
      templates: Record<string, unknown>;
      data: Record<string, unknown>;
      theme: Record<string, unknown> | null;
      formatDate: ((isoString: string, name: string) => string) | null;
      onAction:
        | ((event: { name: string; data: unknown; meta: Record<string, unknown> | null }) => void)
        | null;
    };

    jist.onAction = (event) => {
      log(`Inbox action: ${event.name}`);

      const actionConfig = parseActionConfig(event.data);
      if (!actionConfig) return;

      handleInboxAction(message, actionConfig);
    };

    if (templates) {
      jist.templates = templates;
    }

    if (branding?.theme) {
      jist.theme = branding.theme as Record<string, unknown>;
    }

    jist.formatDate = formatRelativeDate;
    jist.data = (message.properties ?? {}) as unknown as Record<string, unknown>;

    jist.template = ((message as Record<string, unknown>).type as string) ?? null;

    if (index < messages.length - 1) {
      const divider = el('div', { className: 'gist-inbox-divider' });
      divider.style.height = '1px';
      divider.style.background = pattern.dividerColor;
      divider.style.margin = '0';
      container!.appendChild(divider);
    }
  });
}

export function destroyInbox(): void {
  document.getElementById(BUTTON_ID)?.remove();
  document.getElementById(PANEL_ID)?.remove();
  panelOpen = false;
}

function handleInboxAction(message: InboxMessage, config: InboxActionConfig): void {
  if ((config.behavior === 'openUrl' || config.behavior === 'openDeeplink') && config.action) {
    if (config.newTab) {
      window.open(config.action, '_blank', 'noopener');
    } else {
      window.location.href = config.action;
    }
  }

  if (config.behavior === 'dismiss' || config.dismiss) {
    if (message.queueId) {
      void removeInboxMessage(message.queueId);
    }
  }

  Gist.events.dispatch('inboxMessageAction', {
    message,
    action: 'clicked',
  });
}

function parseActionConfig(data: unknown): InboxActionConfig | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;
  const validBehaviors: InboxActionBehavior[] = [
    'openUrl',
    'dismiss',
    'openDeeplink',
    'performAction',
  ];
  if (
    typeof obj.behavior !== 'string' ||
    !validBehaviors.includes(obj.behavior as InboxActionBehavior)
  )
    return null;

  return {
    behavior: obj.behavior as InboxActionBehavior,
    action: typeof obj.action === 'string' ? obj.action : undefined,
    name: typeof obj.name === 'string' ? obj.name : undefined,
    dismiss: typeof obj.dismiss === 'boolean' ? obj.dismiss : undefined,
    newTab: typeof obj.newTab === 'boolean' ? obj.newTab : undefined,
  };
}

const RELATIVE_TIME_THRESHOLDS: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, 'second'],
  [3600, 'minute'],
  [86400, 'hour'],
  [2592000, 'day'],
  [31536000, 'month'],
  [Infinity, 'year'],
];

const UNIT_DIVISORS: Record<string, number> = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  month: 2592000,
  year: 31536000,
};

function formatRelativeDate(isoString: string): string {
  const diffSeconds = Math.round((Date.now() - new Date(isoString).getTime()) / 1000);
  const [, unit] = RELATIVE_TIME_THRESHOLDS.find(
    ([threshold]) => Math.abs(diffSeconds) < threshold
  )!;
  const value = -Math.round(diffSeconds / UNIT_DIVISORS[unit]);
  const formatter = new Intl.RelativeTimeFormat(getUserLocale(), { numeric: 'auto' });
  return formatter.format(value, unit);
}

function positionStyles(position: string, isPanel = false): Record<string, string> {
  const offset = isPanel ? '' : '24px';
  const panelBottom = '96px';

  switch (position) {
    case 'bottom-left':
      return isPanel
        ? { bottom: panelBottom, left: '24px', right: '', top: '' }
        : { bottom: offset, left: offset, right: '', top: '' };
    case 'top-right':
      return isPanel
        ? { top: panelBottom, right: '24px', bottom: '', left: '' }
        : { top: offset, right: offset, bottom: '', left: '' };
    case 'top-left':
      return isPanel
        ? { top: panelBottom, left: '24px', bottom: '', right: '' }
        : { top: offset, left: offset, bottom: '', right: '' };
    case 'bottom-right':
    default:
      return isPanel
        ? { bottom: panelBottom, right: '24px', left: '', top: '' }
        : { bottom: offset, right: offset, left: '', top: '' };
  }
}
