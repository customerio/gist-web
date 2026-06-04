import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../gist', () => ({
  default: {
    events: { dispatch: vi.fn(), on: vi.fn() },
  },
}));
vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/dom', () => ({
  el: vi.fn((tag: string, attrs: Record<string, unknown> = {}) => {
    const element = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      (element as unknown as Record<string, unknown>)[k] = v;
    }
    return element;
  }),
  injectStylesheet: vi.fn(),
  appendToBody: vi.fn((element: HTMLElement) => {
    document.body.appendChild(element);
  }),
}));
vi.mock('./branding-manager', () => ({
  getBranding: vi.fn(() => null),
}));
vi.mock('./templates-manager', () => ({
  getTemplates: vi.fn(() => null),
}));
vi.mock('./inbox-config-manager', () => ({
  ensureInboxDependencies: vi.fn(() => Promise.resolve()),
}));
vi.mock('./inbox-message-manager', () => ({
  getInboxMessagesFromLocalStore: vi.fn(() => Promise.resolve([])),
  updateInboxMessageOpenState: vi.fn(() => Promise.resolve()),
  removeInboxMessage: vi.fn(() => Promise.resolve()),
}));
vi.mock('@customerio/jist', () => ({
  default: class MockJistTemplateElement extends HTMLElement {},
}));

import {
  initializeInboxComponent,
  updateInbox,
  destroyInbox,
  resetInboxComponentState,
} from './inbox-component-manager';
import Gist from '../gist';
import { injectStylesheet } from '../utilities/dom';
import { getBranding } from './branding-manager';
import { getTemplates } from './templates-manager';
import {
  getInboxMessagesFromLocalStore,
  updateInboxMessageOpenState,
  removeInboxMessage,
} from './inbox-message-manager';
import type { InboxMessage } from './inbox-message-manager';
import type { Branding, InboxPattern } from '../types';

function makeBranding(overrides: Partial<InboxPattern> = {}): Branding {
  return {
    theme: { heading: {} },
    patterns: {
      inbox: {
        floatingIcon: { background: '#010101', color: '#ffffff', svg: '<svg></svg>' },
        background: '#f1f1f1',
        cornerRadius: 8,
        borderColor: '#d9d9d9',
        dividerColor: '#d9d9d9',
        shadow: { color: '#00000026', offsetX: 0, offsetY: 2, blur: 8 },
        position: 'bottom-right',
        hoverBackground: '#f5f5f5',
        unreadIndicator: {
          showAlert: true,
          text: {
            fontSize: 8,
            fontWeight: 400,
            fontFamily: 'sans-serif',
            color: '#ffffff',
            lineHeight: 1.5,
          },
          background: '#e00000',
        },
        ...overrides,
      },
    },
  };
}

function makeInboxMessage(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    messageId: 'm1',
    queueId: 'q1',
    opened: false,
    topics: ['cio_inbox_default'],
    ...overrides,
  };
}

describe('inbox-component-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    resetInboxComponentState();
    vi.mocked(getBranding).mockReturnValue(null);
    vi.mocked(getTemplates).mockReturnValue(null);
    vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue([]);
  });

  describe('initializeInboxComponent', () => {
    it('injects inbox stylesheet', () => {
      initializeInboxComponent();

      expect(injectStylesheet).toHaveBeenCalledWith('gist-inbox-styles', expect.any(String));
    });

    it('registers messageInboxUpdated event listener', () => {
      initializeInboxComponent();

      expect(Gist.events.on).toHaveBeenCalledWith('messageInboxUpdated', expect.any(Function));
    });
  });

  describe('updateInbox', () => {
    it('does not render button when no messages have cio_inbox topic', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [makeInboxMessage({ topics: ['other_topic'] })];

      await updateInbox(messages);

      expect(document.getElementById('gist-inbox-button')).toBeNull();
    });

    it('does not render button when branding is missing', async () => {
      vi.mocked(getBranding).mockReturnValue(null);
      const messages = [makeInboxMessage()];

      await updateInbox(messages);

      expect(document.getElementById('gist-inbox-button')).toBeNull();
    });

    it('renders button when inbox messages exist and branding is available', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [makeInboxMessage()];

      await updateInbox(messages);

      const button = document.getElementById('gist-inbox-button');
      expect(button).not.toBeNull();
      expect(button?.style.background).toBeTruthy();
    });

    it('renders unread badge with correct count', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [
        makeInboxMessage({ messageId: 'm1', opened: false }),
        makeInboxMessage({ messageId: 'm2', opened: true }),
        makeInboxMessage({ messageId: 'm3', opened: false }),
      ];

      await updateInbox(messages);

      const badge = document.getElementById('gist-inbox-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toBe('2');
    });

    it('hides badge when all messages are opened', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [makeInboxMessage({ opened: true })];

      await updateInbox(messages);

      expect(document.getElementById('gist-inbox-badge')).toBeNull();
    });

    it('hides badge when showAlert is false', async () => {
      vi.mocked(getBranding).mockReturnValue(
        makeBranding({
          unreadIndicator: {
            showAlert: false,
            text: {
              fontSize: 8,
              fontWeight: 400,
              fontFamily: 'sans-serif',
              color: '#fff',
              lineHeight: 1.5,
            },
            background: '#e00000',
          },
        })
      );
      const messages = [makeInboxMessage({ opened: false })];

      await updateInbox(messages);

      expect(document.getElementById('gist-inbox-badge')).toBeNull();
    });

    it('filters messages by cio_inbox topic prefix', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [
        makeInboxMessage({ messageId: 'm1', topics: ['cio_inbox_news'] }),
        makeInboxMessage({ messageId: 'm2', topics: ['alerts'] }),
        makeInboxMessage({ messageId: 'm3', topics: ['cio_inbox_updates'] }),
      ];

      await updateInbox(messages);

      const badge = document.getElementById('gist-inbox-badge');
      expect(badge?.textContent).toBe('2');
    });
  });

  describe('opening the panel', () => {
    it('marks all unopened inbox messages as opened when the panel is opened', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [
        makeInboxMessage({ messageId: 'm1', queueId: 'q1', opened: false }),
        makeInboxMessage({ messageId: 'm2', queueId: 'q2', opened: true }),
        makeInboxMessage({ messageId: 'm3', queueId: 'q3', opened: false }),
      ];
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue(messages);

      await updateInbox(messages);

      const button = document.getElementById('gist-inbox-button');
      button!.click();
      await vi.waitFor(() => {
        expect(updateInboxMessageOpenState).toHaveBeenCalledTimes(2);
      });

      expect(updateInboxMessageOpenState).toHaveBeenCalledWith('q1', true);
      expect(updateInboxMessageOpenState).toHaveBeenCalledWith('q3', true);
    });

    it('marks new unopened messages as opened when panel is already open', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const initialMessages = [makeInboxMessage({ messageId: 'm1', queueId: 'q1', opened: false })];
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue(initialMessages);

      await updateInbox(initialMessages);
      document.getElementById('gist-inbox-button')!.click();
      await vi.waitFor(() => {
        expect(updateInboxMessageOpenState).toHaveBeenCalledWith('q1', true);
      });
      vi.mocked(updateInboxMessageOpenState).mockClear();

      const updatedMessages = [
        makeInboxMessage({ messageId: 'm1', queueId: 'q1', opened: true }),
        makeInboxMessage({ messageId: 'm2', queueId: 'q2', opened: false }),
      ];
      await updateInbox(updatedMessages);

      expect(updateInboxMessageOpenState).toHaveBeenCalledTimes(1);
      expect(updateInboxMessageOpenState).toHaveBeenCalledWith('q2', true);
    });

    it('does not mark messages as opened when closing the panel', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      const messages = [makeInboxMessage({ opened: false })];
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue(messages);

      await updateInbox(messages);

      const button = document.getElementById('gist-inbox-button');
      button!.click();
      await vi.waitFor(() => {
        expect(updateInboxMessageOpenState).toHaveBeenCalled();
      });
      vi.mocked(updateInboxMessageOpenState).mockClear();

      button!.click();

      expect(updateInboxMessageOpenState).not.toHaveBeenCalled();
    });
  });

  describe('inbox action handling', () => {
    function setupPanelWithMessage(message: InboxMessage) {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue([message]);
      return message;
    }

    async function openPanelAndGetJist(): Promise<HTMLElement> {
      await updateInbox(await getInboxMessagesFromLocalStore());
      const button = document.getElementById('gist-inbox-button')!;
      button.click();
      await vi.waitFor(() => {
        expect(document.getElementById('gist-inbox-panel')).not.toBeNull();
      });
      return document.querySelector('jist-template')! as HTMLElement;
    }

    function fireAction(jistEl: HTMLElement, actionName: string, data: unknown) {
      const jist = jistEl as unknown as {
        onAction: (event: { name: string; data: unknown; meta: null }) => void;
      };
      jist.onAction({ name: actionName, data, meta: null });
    }

    it('dismiss behavior removes the message from the queue', async () => {
      setupPanelWithMessage(makeInboxMessage({ queueId: 'q1' }));
      const jistEl = await openPanelAndGetJist();

      fireAction(jistEl, 'myButton', { behavior: 'dismiss' });

      expect(removeInboxMessage).toHaveBeenCalledWith('q1');
      expect(Gist.events.dispatch).toHaveBeenCalledWith('inboxMessageAction', {
        message: expect.objectContaining({ queueId: 'q1' }),
        action: 'clicked',
        actionConfig: expect.objectContaining({ behavior: 'dismiss' }),
      });
    });

    it('openUrl behavior navigates to the URL', async () => {
      setupPanelWithMessage(makeInboxMessage());
      const jistEl = await openPanelAndGetJist();

      const hrefSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
        ...window.location,
        href: '',
      } as unknown as Location);
      const assignSpy = vi.fn();
      Object.defineProperty(window.location, 'href', { set: assignSpy, configurable: true });

      fireAction(jistEl, 'myLink', { behavior: 'openUrl', action: 'https://example.com' });

      expect(assignSpy).toHaveBeenCalledWith('https://example.com');
      expect(removeInboxMessage).not.toHaveBeenCalled();
      hrefSpy.mockRestore();
    });

    it('openUrl with newTab opens in a new tab', async () => {
      setupPanelWithMessage(makeInboxMessage());
      const jistEl = await openPanelAndGetJist();

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      fireAction(jistEl, 'myLink', {
        behavior: 'openUrl',
        action: 'https://example.com',
        newTab: true,
      });

      expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener');
      openSpy.mockRestore();
    });

    it('dismiss property chains with openUrl to also remove the message', async () => {
      setupPanelWithMessage(makeInboxMessage({ queueId: 'q1' }));
      const jistEl = await openPanelAndGetJist();

      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      fireAction(jistEl, 'myLink', {
        behavior: 'openUrl',
        action: 'https://example.com',
        dismiss: true,
      });

      expect(removeInboxMessage).toHaveBeenCalledWith('q1');
      openSpy.mockRestore();
    });

    it('performAction dispatches event without extra side effects', async () => {
      setupPanelWithMessage(makeInboxMessage({ queueId: 'q1' }));
      const jistEl = await openPanelAndGetJist();

      fireAction(jistEl, 'myAction', { behavior: 'performAction' });

      expect(removeInboxMessage).not.toHaveBeenCalled();
      expect(Gist.events.dispatch).toHaveBeenCalledWith('inboxMessageAction', {
        message: expect.objectContaining({ queueId: 'q1' }),
        action: 'clicked',
        actionConfig: expect.objectContaining({ behavior: 'performAction' }),
      });
    });

    it('ignores action when event data has no valid behavior', async () => {
      setupPanelWithMessage(makeInboxMessage());
      const jistEl = await openPanelAndGetJist();

      fireAction(jistEl, 'myAction', null);

      expect(removeInboxMessage).not.toHaveBeenCalled();
      expect(Gist.events.dispatch).not.toHaveBeenCalledWith(
        'inboxMessageAction',
        expect.objectContaining({ action: 'clicked' })
      );
    });
  });

  describe('destroyInbox', () => {
    it('removes button and panel from DOM', async () => {
      vi.mocked(getBranding).mockReturnValue(makeBranding());
      await updateInbox([makeInboxMessage()]);

      expect(document.getElementById('gist-inbox-button')).not.toBeNull();

      destroyInbox();

      expect(document.getElementById('gist-inbox-button')).toBeNull();
      expect(document.getElementById('gist-inbox-panel')).toBeNull();
    });
  });
});
