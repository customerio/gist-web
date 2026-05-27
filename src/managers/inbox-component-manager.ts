import Gist from '../gist';
import { el, injectStylesheet, appendToBody } from '../utilities/dom';
import { log } from '../utilities/log';
import { getBranding } from './branding-manager';
import { getTemplates } from './templates-manager';
import {
  getInboxMessagesFromLocalStore,
  updateInboxMessageOpenState,
} from './inbox-message-manager';
import { INBOX_CSS } from './inbox-component-styles';
import type { InboxMessage } from './inbox-message-manager';
import type { InboxPattern } from '../types';
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
      onAction:
        | ((event: { name: string; data: unknown; meta: Record<string, unknown> | null }) => void)
        | null;
    };

    jist.onAction = (event) => {
      log(`Inbox action: ${event.name}`);
      Gist.events.dispatch('inboxMessageAction', {
        message,
        action: event.name,
        data: event.data,
        meta: event.meta,
      });
    };

    if (templates) {
      jist.templates = templates;
    }

    if (branding?.theme) {
      jist.theme = branding.theme as Record<string, unknown>;
    }

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
