import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GistConfig, GistMessage, DisplaySettings } from './types';
import type { InboxMessage } from './managers/inbox-message-manager';

const mockDispatch = vi.fn();

vi.mock('./utilities/log', () => ({ log: vi.fn() }));
vi.mock('./utilities/event-emitter', () => {
  return {
    default: class {
      dispatch = mockDispatch;
    },
  };
});
vi.mock('./utilities/local-storage', () => ({
  clearExpiredFromLocalStore: vi.fn(),
}));
vi.mock('./managers/queue-manager', () => ({
  startQueueListener: vi.fn(() => Promise.resolve()),
  checkMessageQueue: vi.fn(() => Promise.resolve()),
  checkCurrentMessagesAfterRouteChange: vi.fn(() => Promise.resolve()),
  stopSSEListener: vi.fn(),
}));
vi.mock('./managers/user-manager', () => ({
  setUserToken: vi.fn(),
  clearUserToken: vi.fn(),
  useGuestSession: vi.fn(),
}));
vi.mock('./managers/message-manager', () => ({
  showMessage: vi.fn(),
  embedMessage: vi.fn(),
  hideMessage: vi.fn(() => Promise.resolve()),
  removePersistentMessage: vi.fn(() => Promise.resolve()),
  logBroadcastDismissedLocally: vi.fn(() => Promise.resolve()),
}));
vi.mock('./utilities/message-utils', () => ({
  fetchMessageByInstanceId: vi.fn(),
}));
vi.mock('./managers/message-component-manager', () => ({
  sendDisplaySettingsToIframe: vi.fn(),
  clearAllTooltipHandles: vi.fn(),
  startColorSchemeObserver: vi.fn(),
  applyColorSchemeChange: vi.fn(),
}));
vi.mock('./managers/locale-manager', () => ({
  setUserLocale: vi.fn(),
}));
vi.mock('./managers/custom-attribute-manager', () => ({
  setCustomAttribute: vi.fn(() => true),
  clearCustomAttributes: vi.fn(),
  removeCustomAttribute: vi.fn(() => true),
}));
vi.mock('./utilities/preview-mode', () => ({
  setupPreview: vi.fn(() => false),
}));
vi.mock('./managers/inbox-message-manager', () => ({
  getInboxMessagesFromLocalStore: vi.fn(() => Promise.resolve([])),
  updateInboxMessageOpenState: vi.fn(() => Promise.resolve()),
  removeInboxMessage: vi.fn(() => Promise.resolve()),
}));
vi.mock('./managers/inbox-config-manager', () => ({
  isInboxEnabled: vi.fn(() => false),
  initializeInboxFromCache: vi.fn(),
}));
vi.mock('./managers/embed-manager', () => ({
  renderEmbed: vi.fn(() => Promise.resolve('instance-1')),
  renderEmbeds: vi.fn(() => Promise.resolve(['instance-1'])),
  readEmbedPayloads: vi.fn(() => []),
  clearEmbedState: vi.fn(),
}));

import Gist from './gist';
import { clearExpiredFromLocalStore } from './utilities/local-storage';
import {
  startQueueListener,
  checkMessageQueue,
  checkCurrentMessagesAfterRouteChange,
  stopSSEListener,
} from './managers/queue-manager';
import { setUserToken, clearUserToken, useGuestSession } from './managers/user-manager';
import {
  showMessage,
  embedMessage,
  hideMessage,
  removePersistentMessage,
  logBroadcastDismissedLocally,
} from './managers/message-manager';
import { fetchMessageByInstanceId } from './utilities/message-utils';
import {
  sendDisplaySettingsToIframe,
  clearAllTooltipHandles,
  startColorSchemeObserver,
  applyColorSchemeChange,
} from './managers/message-component-manager';
import { setUserLocale } from './managers/locale-manager';
import {
  setCustomAttribute,
  clearCustomAttributes,
  removeCustomAttribute,
} from './managers/custom-attribute-manager';
import { setupPreview } from './utilities/preview-mode';
import {
  getInboxMessagesFromLocalStore,
  updateInboxMessageOpenState,
  removeInboxMessage,
} from './managers/inbox-message-manager';
import { isInboxEnabled, initializeInboxFromCache } from './managers/inbox-config-manager';
import {
  renderEmbed,
  renderEmbeds,
  readEmbedPayloads,
  clearEmbedState,
} from './managers/embed-manager';

function resetGist() {
  Gist.initialized = false;
  Gist.currentMessages = [];
  Gist.overlayInstanceId = null;
  Gist.currentRoute = null;
  Gist.routeInitialized = false;
  Gist.isDocumentVisible = true;
  Gist.config = undefined as unknown as GistConfig;
  Gist.events = undefined as unknown as typeof Gist.events;
}

function baseConfig(overrides: Partial<GistConfig> = {}): GistConfig {
  return {
    siteId: 'test-site',
    ...overrides,
  };
}

describe('Gist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(setupPreview).mockReturnValue(false);
    vi.mocked(startQueueListener).mockResolvedValue();
    vi.mocked(checkMessageQueue).mockResolvedValue();
    vi.mocked(checkCurrentMessagesAfterRouteChange).mockResolvedValue();
    vi.mocked(hideMessage).mockResolvedValue();
    vi.mocked(removePersistentMessage).mockResolvedValue();
    vi.mocked(logBroadcastDismissedLocally).mockResolvedValue();
    vi.mocked(setCustomAttribute).mockReturnValue(true);
    vi.mocked(removeCustomAttribute).mockReturnValue(true);
    vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue([]);
    vi.mocked(updateInboxMessageOpenState).mockResolvedValue();
    vi.mocked(removeInboxMessage).mockResolvedValue();
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
      configurable: true,
    });
    resetGist();
  });

  describe('setup', () => {
    it('initializes config with defaults', async () => {
      await Gist.setup(baseConfig());

      expect(Gist.config.env).toBe('prod');
      expect(Gist.config.logging).toBe(false);
      expect(Gist.config.experiments).toBe(false);
      expect(Gist.config.useAnonymousSession).toBe(false);
      expect(Gist.config.siteId).toBe('test-site');
      expect(Gist.config.colorScheme).toBe('default');
    });

    it('respects provided config values', async () => {
      await Gist.setup(
        baseConfig({
          env: 'dev',
          logging: true,
          experiments: true,
          useAnonymousSession: true,
          colorScheme: 'system',
        })
      );

      expect(Gist.config.env).toBe('dev');
      expect(Gist.config.logging).toBe(true);
      expect(Gist.config.experiments).toBe(true);
      expect(Gist.config.useAnonymousSession).toBe(true);
      expect(Gist.config.colorScheme).toBe('system');
    });

    it('is idempotent — second call is a no-op', async () => {
      await Gist.setup(baseConfig());
      vi.mocked(startQueueListener).mockClear();

      await Gist.setup(baseConfig({ env: 'dev' }));

      expect(startQueueListener).not.toHaveBeenCalled();
      expect(Gist.config.env).toBe('prod');
    });

    it('starts queue listener', async () => {
      await Gist.setup(baseConfig());
      expect(startQueueListener).toHaveBeenCalled();
    });

    it('uses guest session when useAnonymousSession is true and no ajs_uid param', async () => {
      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
        configurable: true,
      });

      await Gist.setup(baseConfig({ useAnonymousSession: true }));

      expect(useGuestSession).toHaveBeenCalled();
    });

    it('does not use guest session when ajs_uid is present', async () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?ajs_uid=abc' },
        writable: true,
        configurable: true,
      });

      await Gist.setup(baseConfig({ useAnonymousSession: true }));

      expect(useGuestSession).not.toHaveBeenCalled();

      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true,
        configurable: true,
      });
    });

    it('does not use guest session in preview mode', async () => {
      vi.mocked(setupPreview).mockReturnValue(true);

      await Gist.setup(baseConfig({ useAnonymousSession: true }));

      expect(useGuestSession).not.toHaveBeenCalled();
    });

    it('clears expired items from local store', async () => {
      await Gist.setup(baseConfig());
      expect(clearExpiredFromLocalStore).toHaveBeenCalled();
    });

    it('initializes currentMessages as empty array', async () => {
      await Gist.setup(baseConfig());
      expect(Gist.currentMessages).toEqual([]);
    });

    it('clears all tooltip handles during setup', async () => {
      await Gist.setup(baseConfig());
      expect(clearAllTooltipHandles).toHaveBeenCalled();
    });

    it('starts color scheme observer when colorScheme is auto', async () => {
      await Gist.setup(baseConfig({ colorScheme: 'auto' }));
      expect(startColorSchemeObserver).toHaveBeenCalled();
    });

    it('does not start color scheme observer when colorScheme is default', async () => {
      await Gist.setup(baseConfig());
      expect(startColorSchemeObserver).not.toHaveBeenCalled();
    });

    it('sets isDocumentVisible to true', async () => {
      await Gist.setup(baseConfig());
      expect(Gist.isDocumentVisible).toBe(true);
    });

    it('sets routeInitialized to false', async () => {
      await Gist.setup(baseConfig());
      expect(Gist.routeInitialized).toBe(false);
    });

    it('sets routeInitialized to true after grace period', async () => {
      vi.useFakeTimers();
      await Gist.setup(baseConfig());

      expect(Gist.routeInitialized).toBe(false);
      vi.advanceTimersByTime(2000);
      expect(Gist.routeInitialized).toBe(true);
      expect(checkMessageQueue).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('does not override routeInitialized if setCurrentRoute was called before grace period', async () => {
      vi.useFakeTimers();
      await Gist.setup(baseConfig());
      vi.mocked(checkMessageQueue).mockClear();

      await Gist.setCurrentRoute('/cart');
      expect(Gist.routeInitialized).toBe(true);

      vi.mocked(checkMessageQueue).mockClear();
      vi.advanceTimersByTime(2000);
      // Timer fires but is a no-op since routeInitialized is already true
      expect(checkMessageQueue).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('setCurrentRoute', () => {
    it('updates currentRoute and triggers queue check', async () => {
      await Gist.setup(baseConfig());
      vi.mocked(checkMessageQueue).mockClear();
      vi.mocked(checkCurrentMessagesAfterRouteChange).mockClear();

      await Gist.setCurrentRoute('/home');

      expect(Gist.currentRoute).toBe('/home');
      expect(checkCurrentMessagesAfterRouteChange).toHaveBeenCalled();
      expect(checkMessageQueue).toHaveBeenCalled();
    });

    it('sets routeInitialized to true', async () => {
      await Gist.setup(baseConfig());
      expect(Gist.routeInitialized).toBe(false);

      await Gist.setCurrentRoute('/home');

      expect(Gist.routeInitialized).toBe(true);
    });
  });

  describe('setUserToken', () => {
    it('is a no-op in preview sessions', async () => {
      vi.mocked(setupPreview).mockReturnValue(true);
      await Gist.setup(baseConfig());
      vi.mocked(startQueueListener).mockClear();

      await Gist.setUserToken('token-123');

      expect(setUserToken).not.toHaveBeenCalled();
      expect(stopSSEListener).not.toHaveBeenCalled();
      expect(startQueueListener).not.toHaveBeenCalled();
    });

    it('stops SSE and restarts queue listener', async () => {
      await Gist.setup(baseConfig());
      vi.mocked(startQueueListener).mockClear();

      await Gist.setUserToken('token-123');

      expect(setUserToken).toHaveBeenCalledWith('token-123', undefined);
      expect(stopSSEListener).toHaveBeenCalledWith(true);
      expect(startQueueListener).toHaveBeenCalled();
    });

    it('passes expiryDate when provided', async () => {
      await Gist.setup(baseConfig());

      const expiry = new Date('2026-12-31');
      await Gist.setUserToken('token-123', expiry);

      expect(setUserToken).toHaveBeenCalledWith('token-123', expiry);
    });
  });

  describe('clearUserToken', () => {
    it('is a no-op in preview sessions', async () => {
      vi.mocked(setupPreview).mockReturnValue(true);
      await Gist.setup(baseConfig());

      await Gist.clearUserToken();

      expect(clearUserToken).not.toHaveBeenCalled();
    });

    it('falls back to guest session when useAnonymousSession is true', async () => {
      await Gist.setup(baseConfig({ useAnonymousSession: true }));
      vi.mocked(startQueueListener).mockClear();

      await Gist.clearUserToken();

      expect(clearUserToken).toHaveBeenCalled();
      expect(useGuestSession).toHaveBeenCalled();
      expect(stopSSEListener).toHaveBeenCalledWith(true);
      expect(startQueueListener).toHaveBeenCalled();
    });

    it('does not use guest session when useAnonymousSession is false', async () => {
      await Gist.setup(baseConfig({ useAnonymousSession: false }));
      vi.mocked(useGuestSession).mockClear();

      await Gist.clearUserToken();

      expect(clearUserToken).toHaveBeenCalled();
      expect(useGuestSession).not.toHaveBeenCalled();
    });
  });

  describe('dismissMessage', () => {
    it('hides message, removes persistent, logs broadcast, and checks queue', async () => {
      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
      };
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

      await Gist.dismissMessage('inst-1');

      expect(fetchMessageByInstanceId).toHaveBeenCalledWith('inst-1');
      expect(hideMessage).toHaveBeenCalledWith(message);
      expect(removePersistentMessage).toHaveBeenCalledWith(message);
      expect(logBroadcastDismissedLocally).toHaveBeenCalledWith(message);
      expect(checkMessageQueue).toHaveBeenCalled();
    });

    it('returns early when message not found', async () => {
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(undefined);

      await Gist.dismissMessage('nonexistent');

      expect(fetchMessageByInstanceId).toHaveBeenCalledWith('nonexistent');
      expect(hideMessage).not.toHaveBeenCalled();
      expect(removePersistentMessage).not.toHaveBeenCalled();
      expect(logBroadcastDismissedLocally).not.toHaveBeenCalled();
      expect(checkMessageQueue).not.toHaveBeenCalled();
    });
  });

  describe('showMessage', () => {
    it('returns instanceId on success', async () => {
      vi.mocked(showMessage).mockResolvedValue({
        messageId: 'msg-1',
        instanceId: 'inst-1',
      });

      const result = await Gist.showMessage({ messageId: 'msg-1' });

      expect(result).toBe('inst-1');
    });

    it('returns null on failure', async () => {
      vi.mocked(showMessage).mockResolvedValue(null);

      const result = await Gist.showMessage({ messageId: 'msg-1' });

      expect(result).toBeNull();
    });
  });

  describe('embedMessage', () => {
    it('returns instanceId on success', async () => {
      vi.mocked(embedMessage).mockReturnValue({
        messageId: 'msg-1',
        instanceId: 'inst-1',
      });

      const result = await Gist.embedMessage({ messageId: 'msg-1' }, 'element-1');

      expect(result).toBe('inst-1');
    });

    it('returns null on failure', async () => {
      vi.mocked(embedMessage).mockReturnValue(null);

      const result = await Gist.embedMessage({ messageId: 'msg-1' }, 'element-1');

      expect(result).toBeNull();
    });
  });

  describe('updateMessageDisplaySettings', () => {
    it('returns true when message found', async () => {
      await Gist.setup(baseConfig());

      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
      };
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

      const displaySettings: DisplaySettings = { displayType: 'modal' };
      const result = Gist.updateMessageDisplaySettings('inst-1', displaySettings);

      expect(result).toBe(true);
      expect(message.displaySettings).toEqual(displaySettings);
      expect(sendDisplaySettingsToIframe).toHaveBeenCalledWith(message);
    });

    it('returns false when message not found', () => {
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(undefined);
      vi.mocked(sendDisplaySettingsToIframe).mockClear();

      const result = Gist.updateMessageDisplaySettings('inst-1', {
        displayType: 'modal',
      });

      expect(result).toBe(false);
      expect(sendDisplaySettingsToIframe).not.toHaveBeenCalled();
    });
  });

  describe('messageShown', () => {
    it('dispatches event through EventEmitter', async () => {
      await Gist.setup(baseConfig());
      const message: GistMessage = { messageId: 'msg-1' };

      Gist.messageShown(message);

      expect(mockDispatch).toHaveBeenCalledWith('messageShown', message);
    });
  });

  describe('messageDismissed', () => {
    it('dispatches event for non-null message', async () => {
      await Gist.setup(baseConfig());
      const message: GistMessage = { messageId: 'msg-1' };

      Gist.messageDismissed(message);

      expect(mockDispatch).toHaveBeenCalledWith('messageDismissed', message);
    });

    it('handles null message gracefully', async () => {
      await Gist.setup(baseConfig());
      mockDispatch.mockClear();

      Gist.messageDismissed(null);

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  describe('messageError', () => {
    it('dispatches event through EventEmitter', async () => {
      await Gist.setup(baseConfig());
      const message: GistMessage = { messageId: 'msg-1' };

      Gist.messageError(message);

      expect(mockDispatch).toHaveBeenCalledWith('messageError', message);
    });
  });

  describe('messageAction', () => {
    it('dispatches event with message, action, and name', async () => {
      await Gist.setup(baseConfig());
      const message: GistMessage = {
        messageId: 'msg-1',
        instanceId: 'inst-1',
        currentRoute: '/home',
      };

      Gist.messageAction(message, 'click', 'cta-button');

      expect(mockDispatch).toHaveBeenCalledWith('messageAction', {
        message,
        action: 'click',
        name: 'cta-button',
      });
    });
  });

  describe('setUserLocale', () => {
    it('delegates to locale manager', () => {
      Gist.setUserLocale('fr-FR');
      expect(setUserLocale).toHaveBeenCalledWith('fr-FR');
    });
  });

  describe('setColorScheme', () => {
    it('updates config and applies the change', async () => {
      await Gist.setup(baseConfig());
      expect(Gist.config.colorScheme).toBe('default');

      Gist.setColorScheme('auto');

      expect(Gist.config.colorScheme).toBe('auto');
      expect(applyColorSchemeChange).toHaveBeenCalled();
    });
  });

  describe('setCustomAttribute', () => {
    it('delegates to custom attribute manager and returns result', () => {
      vi.mocked(setCustomAttribute).mockReturnValue(true);
      expect(Gist.setCustomAttribute('plan', 'pro')).toBe(true);
      expect(setCustomAttribute).toHaveBeenCalledWith('plan', 'pro');
    });
  });

  describe('clearCustomAttributes', () => {
    it('delegates to custom attribute manager', () => {
      Gist.clearCustomAttributes();
      expect(clearCustomAttributes).toHaveBeenCalled();
    });
  });

  describe('removeCustomAttribute', () => {
    it('delegates to custom attribute manager and returns result', () => {
      vi.mocked(removeCustomAttribute).mockReturnValue(true);
      expect(Gist.removeCustomAttribute('plan')).toBe(true);
      expect(removeCustomAttribute).toHaveBeenCalledWith('plan');
    });
  });

  describe('getInboxUnopenedCount', () => {
    it('returns count of messages where opened is false', async () => {
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue([
        { messageId: 'm1', opened: false } as InboxMessage,
        { messageId: 'm2', opened: true } as InboxMessage,
        { messageId: 'm3', opened: false } as InboxMessage,
      ]);

      const count = await Gist.getInboxUnopenedCount();

      expect(count).toBe(2);
    });

    it('returns 0 when all messages are opened', async () => {
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue([
        { messageId: 'm1', opened: true } as InboxMessage,
      ]);

      const count = await Gist.getInboxUnopenedCount();

      expect(count).toBe(0);
    });
  });

  describe('getInboxMessages', () => {
    it('returns messages from local store', async () => {
      const messages = [{ messageId: 'm1' } as InboxMessage, { messageId: 'm2' } as InboxMessage];
      vi.mocked(getInboxMessagesFromLocalStore).mockResolvedValue(messages);

      const result = await Gist.getInboxMessages();

      expect(result).toEqual(messages);
    });
  });

  describe('updateInboxMessageOpenState', () => {
    it('delegates to inbox message manager', async () => {
      await Gist.updateInboxMessageOpenState('q-1', true);
      expect(updateInboxMessageOpenState).toHaveBeenCalledWith('q-1', true);
    });
  });

  describe('removeInboxMessage', () => {
    it('delegates to inbox message manager', async () => {
      await Gist.removeInboxMessage('q-1');
      expect(removeInboxMessage).toHaveBeenCalledWith('q-1');
    });
  });

  describe('isInboxEnabled', () => {
    it('delegates to inbox config manager', () => {
      vi.mocked(isInboxEnabled).mockReturnValue(true);
      expect(Gist.isInboxEnabled()).toBe(true);
      expect(isInboxEnabled).toHaveBeenCalled();
    });
  });

  describe('embed-only setup', () => {
    it('starts none of the delivery machinery', async () => {
      await Gist.setup(baseConfig({ embedOnly: true, useAnonymousSession: true }));

      expect(Gist.config.embedOnly).toBe(true);
      expect(startQueueListener).not.toHaveBeenCalled();
      expect(useGuestSession).not.toHaveBeenCalled();
      expect(initializeInboxFromCache).not.toHaveBeenCalled();
      expect(setupPreview).not.toHaveBeenCalled();
      expect(Gist.config.isPreviewSession).toBe(false);
    });

    it('still prepares the message state the embed path needs', async () => {
      await Gist.setup(baseConfig({ embedOnly: true }));

      expect(Gist.events).toBeDefined();
      expect(Gist.currentMessages).toEqual([]);
      expect(Gist.isDocumentVisible).toBe(true);
      expect(clearExpiredFromLocalStore).toHaveBeenCalled();
    });

    it('ignores user token changes so identifying never starts the queue', async () => {
      await Gist.setup(baseConfig({ embedOnly: true }));

      await Gist.setUserToken('user-1');
      await Gist.clearUserToken();

      expect(setUserToken).not.toHaveBeenCalled();
      expect(clearUserToken).not.toHaveBeenCalled();
      expect(startQueueListener).not.toHaveBeenCalled();
      expect(stopSSEListener).not.toHaveBeenCalled();
    });

    it('defaults to the full delivery path when embedOnly is not set', async () => {
      await Gist.setup(baseConfig());

      expect(Gist.config.embedOnly).toBe(false);
      expect(startQueueListener).toHaveBeenCalled();
      expect(initializeInboxFromCache).toHaveBeenCalled();
    });
  });

  describe('embed', () => {
    it('auto-initializes in embed-only mode using the payload site id', async () => {
      const payload = { embedId: 'emb_1', siteId: 'payload-site', message: { messageId: 'm-1' } };

      const instanceId = await Gist.embed(payload);

      expect(Gist.initialized).toBe(true);
      expect(Gist.config.embedOnly).toBe(true);
      expect(Gist.config.siteId).toBe('payload-site');
      expect(renderEmbed).toHaveBeenCalledWith(payload);
      expect(instanceId).toBe('instance-1');
    });

    it('leaves an already-initialized SDK alone', async () => {
      await Gist.setup(baseConfig());
      vi.mocked(startQueueListener).mockClear();

      await Gist.embed({ embedId: 'emb_1', message: { messageId: 'm-1' } });

      expect(Gist.config.embedOnly).toBe(false);
      expect(startQueueListener).not.toHaveBeenCalled();
      expect(renderEmbed).toHaveBeenCalled();
    });

    it('mountEmbeds renders the payloads the page declares', async () => {
      const payloads = [{ embedId: 'emb_1', message: { messageId: 'm-1' } }];
      vi.mocked(readEmbedPayloads).mockReturnValue(payloads);

      const instanceIds = await Gist.mountEmbeds();

      expect(renderEmbeds).toHaveBeenCalledWith(payloads);
      expect(instanceIds).toEqual(['instance-1']);
    });

    it('mountEmbeds does not initialize the SDK on a page with no embeds', async () => {
      vi.mocked(readEmbedPayloads).mockReturnValue([]);

      expect(await Gist.mountEmbeds()).toEqual([]);
      expect(Gist.initialized).toBe(false);
      expect(renderEmbeds).not.toHaveBeenCalled();
    });

    it('mountEmbeds takes the site id from the first payload that carries one', async () => {
      vi.mocked(readEmbedPayloads).mockReturnValue([
        { embedId: 'emb_1', message: { messageId: 'm-1' } },
        { embedId: 'emb_2', siteId: 'payload-site', message: { messageId: 'm-2' } },
      ]);

      await Gist.mountEmbeds();

      expect(Gist.config.siteId).toBe('payload-site');
      expect(Gist.config.embedOnly).toBe(true);
    });

    it('warns when payloads disagree about the site they belong to', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(readEmbedPayloads).mockReturnValue([
        { embedId: 'emb_1', siteId: 'site-a', message: { messageId: 'm-1' } },
        { embedId: 'emb_2', siteId: 'site-b', message: { messageId: 'm-2' } },
      ]);

      await Gist.mountEmbeds();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('different site ids'));
      expect(Gist.config.siteId).toBe('site-a');
      warn.mockRestore();
    });

    it('warns when a real setup arrives after an embed-only auto-init', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.mocked(readEmbedPayloads).mockReturnValue([
        { embedId: 'emb_1', message: { messageId: 'm-1' } },
      ]);

      await Gist.mountEmbeds();
      await Gist.setup(baseConfig());

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('embed-only mode'));
      expect(startQueueListener).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('resetEmbed clears the stored frequency state', () => {
      Gist.resetEmbed('emb_1');
      expect(clearEmbedState).toHaveBeenCalledWith('emb_1');
    });
  });
});
