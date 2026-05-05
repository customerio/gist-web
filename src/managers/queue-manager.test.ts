import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkMessageQueue,
  stopSSEListener,
  pullMessagesFromQueue,
  handleMessage,
} from './queue-manager';
import { getEligibleBroadcasts } from './message-broadcast-manager';
import { getMessagesFromLocalStore } from './message-user-queue-manager';
import { showMessage, embedMessage } from './message-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import { findElement } from '../utilities/dom';
import { settings } from '../services/settings';
import Gist from '../gist';
import type { GistMessage } from '../types';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('./user-manager', () => ({
  getUserToken: vi.fn(() => 'test-token'),
  isAnonymousUser: vi.fn(() => false),
}));
vi.mock('../services/queue-service', () => ({
  getUserQueue: vi.fn(),
  getQueueSSEEndpoint: vi.fn(() => null),
  userQueueNextPullCheckLocalStoreName: 'gist.web.userQueueNextPullCheck',
}));
vi.mock('./message-manager', () => ({
  showMessage: vi.fn(() => Promise.resolve(null)),
  embedMessage: vi.fn(() => null),
}));
vi.mock('./gist-properties-manager', () => ({
  resolveMessageProperties: vi.fn(() => ({
    isEmbedded: false,
    elementId: '',
    hasRouteRule: false,
    routeRule: '',
    position: '',
    hasPosition: false,
    shouldScale: false,
    campaignId: null,
    messageWidth: 414,
    overlayColor: '#00000033',
    persistent: false,
    exitClick: false,
    hasCustomWidth: false,
  })),
}));
vi.mock('../utilities/local-storage', () => ({
  clearKeyFromLocalStore: vi.fn(),
  getKeyFromLocalStore: vi.fn(() => null),
}));
vi.mock('./message-broadcast-manager', () => ({
  updateBroadcastsLocalStore: vi.fn(),
  getEligibleBroadcasts: vi.fn(() => Promise.resolve([])),
  isShowAlwaysBroadcast: vi.fn(() => false),
}));
vi.mock('./message-user-queue-manager', () => ({
  updateQueueLocalStore: vi.fn(),
  getMessagesFromLocalStore: vi.fn(() => Promise.resolve([])),
  isMessageLoading: vi.fn(() => Promise.resolve(false)),
  setMessageLoading: vi.fn(),
  getSavedMessageState: vi.fn(() => Promise.resolve(null)),
}));
vi.mock('./inbox-message-manager', () => ({
  updateInboxMessagesLocalStore: vi.fn(),
}));
vi.mock('../services/settings', () => ({
  settings: {
    hasActiveSSEConnection: vi.fn(() => false),
    isSSEConnectionManagedBySDK: vi.fn(() => false),
    useSSE: vi.fn(() => false),
    setActiveSSEConnection: vi.fn(),
    removeActiveSSEConnection: vi.fn(),
    setUseSSEFlag: vi.fn(),
    setSSEHeartbeat: vi.fn(),
    getSSEHeartbeat: vi.fn(() => 30),
    RENDERER_HOST: {
      prod: 'https://renderer.test',
      dev: 'https://renderer.test',
      local: 'http://localhost',
    },
    ENGINE_API_ENDPOINT: {
      prod: 'https://api.test',
      dev: 'https://api.test',
      local: 'http://localhost',
    },
    GIST_VIEW_ENDPOINT: {
      prod: 'https://view.test',
      dev: 'https://view.test',
      local: 'http://localhost',
    },
  },
}));
vi.mock('../utilities/message-utils', () => ({
  applyDisplaySettings: vi.fn(),
}));
vi.mock('../utilities/dom', () => ({
  findElement: vi.fn(() => null),
}));
vi.mock('../gist', () => ({
  default: {
    currentRoute: null,
    isDocumentVisible: true,
    currentMessages: [],
    overlayInstanceId: null,
    config: {},
  },
}));

describe('queue-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkMessageQueue', () => {
    it('processes messages from broadcasts and local store', async () => {
      const broadcastMsg: GistMessage & { priority: number } = {
        messageId: 'b1',
        queueId: 'q1',
        priority: 1,
      };
      const userMsg: GistMessage & { priority: number } = {
        messageId: 'u1',
        queueId: 'q2',
        priority: 2,
      };
      vi.mocked(getEligibleBroadcasts).mockResolvedValue([broadcastMsg]);
      vi.mocked(getMessagesFromLocalStore).mockResolvedValue([userMsg]);

      await checkMessageQueue();

      expect(showMessage).toHaveBeenCalledTimes(2);
      expect(showMessage).toHaveBeenNthCalledWith(1, broadcastMsg);
      expect(showMessage).toHaveBeenNthCalledWith(2, userMsg);
    });
  });

  describe('stopSSEListener', () => {
    it('cleans up SSE state when connection exists', async () => {
      const mockClose = vi.fn();
      vi.stubGlobal(
        'EventSource',
        class MockEventSource {
          close = mockClose;
          addEventListener = vi.fn();
        }
      );
      const { getQueueSSEEndpoint } = await import('../services/queue-service');
      vi.mocked(getQueueSSEEndpoint).mockReturnValue('https://sse.test/');
      vi.mocked(settings.useSSE).mockReturnValue(true);

      await pullMessagesFromQueue();

      stopSSEListener();

      expect(mockClose).toHaveBeenCalled();
    });

    it('with disconnectGlobally removes active connection', () => {
      stopSSEListener(true);

      expect(settings.removeActiveSSEConnection).toHaveBeenCalled();
      expect(settings.setUseSSEFlag).toHaveBeenCalledWith(false);
    });
  });

  describe('handleMessage – live preview with invalid elementId', () => {
    it('falls back to showMessage when embedded element is not found in live preview', async () => {
      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: true,
        elementId: 'nonexistent-element',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: '',
        hasTooltipPosition: false,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });
      vi.mocked(findElement).mockReturnValue(null);
      (Gist as unknown as Record<string, unknown>).config = { isPreviewSession: true };

      const message: GistMessage = {
        messageId: 'preview-msg',
        queueId: 'q-preview',
        properties: { gist: { livePreview: true, elementId: 'nonexistent-element' } },
      };

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
      expect(embedMessage).not.toHaveBeenCalled();
    });

    it('uses embedMessage when embedded element exists in live preview', async () => {
      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: true,
        elementId: 'real-element',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: '',
        hasTooltipPosition: false,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });
      vi.mocked(findElement).mockReturnValue(document.createElement('div'));
      (Gist as unknown as Record<string, unknown>).config = { isPreviewSession: true };

      const message: GistMessage = {
        messageId: 'preview-msg-2',
        queueId: 'q-preview-2',
        properties: { gist: { livePreview: true, elementId: 'real-element' } },
      };

      await handleMessage(message);

      expect(embedMessage).toHaveBeenCalledWith(message, 'real-element');
      expect(showMessage).not.toHaveBeenCalled();
    });

    it('uses embedMessage when not in preview session even if element is missing', async () => {
      vi.mocked(resolveMessageProperties).mockReturnValue({
        isEmbedded: true,
        elementId: 'missing-element',
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition: '',
        hasTooltipPosition: false,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      });
      vi.mocked(findElement).mockReturnValue(null);
      (Gist as unknown as Record<string, unknown>).config = { isPreviewSession: false };

      const message: GistMessage = {
        messageId: 'normal-msg',
        queueId: 'q-normal',
        properties: { gist: { elementId: 'missing-element' } },
      };

      await handleMessage(message);

      expect(embedMessage).toHaveBeenCalledWith(message, 'missing-element');
      expect(showMessage).not.toHaveBeenCalled();
    });
  });

  describe('handleMessage – route rules', () => {
    const defaultProperties = {
      isEmbedded: false,
      elementId: '',
      hasRouteRule: false,
      routeRule: '',
      position: '',
      hasPosition: false,
      tooltipPosition: '',
      hasTooltipPosition: false,
      tooltipArrowColor: '#fff',
      shouldScale: false,
      campaignId: null,
      messageWidth: 414,
      overlayColor: '#00000033',
      persistent: false,
      exitClick: false,
      hasCustomWidth: false,
    };

    const message: GistMessage = {
      messageId: 'route-test-msg',
      queueId: 'q-route',
    };

    function withRouteRule(routeRule: string) {
      vi.mocked(resolveMessageProperties).mockReturnValue({
        ...defaultProperties,
        hasRouteRule: true,
        routeRule,
      });
    }

    function navigateTo(path: string) {
      window.history.pushState({}, '', path);
    }

    beforeEach(() => {
      (Gist as unknown as Record<string, unknown>).currentRoute = null;
      (Gist as unknown as Record<string, unknown>).config = {};
      navigateTo('/');
    });

    // --- No rules ---

    it('shows message when no route rule is set', async () => {
      vi.mocked(resolveMessageProperties).mockReturnValue(defaultProperties);
      navigateTo('/any-page');

      const result = await handleMessage(message);

      expect(result).toBe(false); // false because showMessage mock returns null
      expect(showMessage).toHaveBeenCalledWith(message);
    });

    // --- Contains rules (.*value.*) ---

    it('shows message when "contains" rule matches pathname', async () => {
      withRouteRule('^(.*\\/dashboard.*)$');
      navigateTo('/dashboard');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('shows message when "contains" rule matches nested pathname', async () => {
      withRouteRule('^(.*\\/dashboard.*)$');
      navigateTo('/dashboard/settings/billing');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('shows message when "contains" rule matches pathname with prefix', async () => {
      withRouteRule('^(.*\\/dashboard.*)$');
      navigateTo('/app/dashboard');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('blocks message when "contains" rule does not match pathname', async () => {
      withRouteRule('^(.*\\/dashboard.*)$');
      navigateTo('/pricing');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    // --- Equals rules (exact match) ---

    it('shows message when "equals" rule matches pathname exactly', async () => {
      withRouteRule('^(\\/pricing)$');
      navigateTo('/pricing');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('blocks message when "equals" rule does not match longer pathname', async () => {
      withRouteRule('^(\\/pricing)$');
      navigateTo('/pricing/enterprise');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    it('blocks message when "equals" rule does not match different pathname', async () => {
      withRouteRule('^(\\/pricing)$');
      navigateTo('/about');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    // --- Multiple OR rules (include logic) ---

    it('shows message when first of multiple OR rules matches', async () => {
      withRouteRule('^((.*\\/dashboard.*)|(\\/pricing))$');
      navigateTo('/dashboard');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('shows message when second of multiple OR rules matches', async () => {
      withRouteRule('^((.*\\/dashboard.*)|(\\/pricing))$');
      navigateTo('/pricing');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('blocks message when no OR rules match', async () => {
      withRouteRule('^((.*\\/dashboard.*)|(\\/pricing))$');
      navigateTo('/about');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    // --- DO_NOT_DISPLAY_REGEX (platform blocking) ---

    it('blocks message with DO_NOT_DISPLAY_REGEX', async () => {
      withRouteRule('^DO_NOT_DISPLAY_IN_APP$');
      navigateTo('/dashboard');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    it('blocks message with DO_NOT_DISPLAY_REGEX on root path', async () => {
      withRouteRule('^DO_NOT_DISPLAY_IN_APP$');
      navigateTo('/');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    // --- Root and special paths ---

    it('shows message when rule matches root path', async () => {
      withRouteRule('^(\\/)$');
      navigateTo('/');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('blocks message when root-only rule does not match other paths', async () => {
      withRouteRule('^(\\/)$');
      navigateTo('/dashboard');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    it('shows message when rule matches deeply nested path', async () => {
      withRouteRule('^(.*\\/settings\\/billing.*)$');
      navigateTo('/app/settings/billing/invoices');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    // --- Exclude rules (negative lookahead) ---

    it('shows message when exclude rule does not match', async () => {
      // Include /dashboard but exclude /admin paths
      withRouteRule('^(?!.*\\/admin)(.*\\/dashboard.*)$');
      navigateTo('/dashboard');

      await handleMessage(message);

      expect(showMessage).toHaveBeenCalledWith(message);
    });

    it('blocks message when exclude rule matches', async () => {
      withRouteRule('^(?!.*\\/admin)(.*\\/dashboard.*)$');
      navigateTo('/admin/dashboard');

      const result = await handleMessage(message);

      expect(result).toBe(false);
      expect(showMessage).not.toHaveBeenCalled();
    });

    // --- currentRoute backward compatibility ---

    describe('currentRoute fallback', () => {
      it('shows message when pathname does not match but currentRoute does', async () => {
        withRouteRule('^(Dashboard)$');
        navigateTo('/home');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'Dashboard';

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('blocks message when neither pathname nor currentRoute matches', async () => {
        withRouteRule('^(Dashboard)$');
        navigateTo('/home');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'Settings';

        const result = await handleMessage(message);

        expect(result).toBe(false);
        expect(showMessage).not.toHaveBeenCalled();
      });

      it('does not use currentRoute fallback when currentRoute equals pathname', async () => {
        withRouteRule('^(\\/dashboard)$');
        navigateTo('/dashboard');
        (Gist as unknown as Record<string, unknown>).currentRoute = '/dashboard';

        await handleMessage(message);

        // Still shows because pathname matches directly
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('shows message when currentRoute is null and pathname matches', async () => {
        withRouteRule('^(.*\\/dashboard.*)$');
        navigateTo('/dashboard');
        (Gist as unknown as Record<string, unknown>).currentRoute = null;

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('blocks message when currentRoute is null and pathname does not match', async () => {
        withRouteRule('^(.*\\/dashboard.*)$');
        navigateTo('/pricing');
        (Gist as unknown as Record<string, unknown>).currentRoute = null;

        const result = await handleMessage(message);

        expect(result).toBe(false);
        expect(showMessage).not.toHaveBeenCalled();
      });
    });

    // --- Real-world backward compatibility scenarios ---

    describe('backward compatibility with analytics.page() variants', () => {
      it('matches when page was called with a name: analytics.page("Dashboard")', async () => {
        // Customer set rule: equals "Dashboard"
        // SDK was called: analytics.page('Dashboard') → setCurrentRoute('Dashboard')
        withRouteRule('^(Dashboard)$');
        navigateTo('/app/main');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'Dashboard';

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('matches when page was called with no args: analytics.page()', async () => {
        // Customer set rule: contains "/dashboard"
        // SDK was called: analytics.page() → setCurrentRoute(window.location.pathname)
        withRouteRule('^(.*\\/dashboard.*)$');
        navigateTo('/dashboard');
        (Gist as unknown as Record<string, unknown>).currentRoute = '/dashboard';

        await handleMessage(message);

        // pathname matches directly; currentRoute = pathname so fallback is skipped
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('matches pathname even when page was never called', async () => {
        // Customer set rule: contains "/dashboard"
        // analytics.page() was never called, so currentRoute = null
        withRouteRule('^(.*\\/dashboard.*)$');
        navigateTo('/dashboard');
        (Gist as unknown as Record<string, unknown>).currentRoute = null;

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('matches when currentRoute is a full URL from older SDK behavior', async () => {
        // Older SDK versions could set currentRoute to the full URL
        withRouteRule('^(.*\\/dashboard.*)$');
        navigateTo('/dashboard');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'http://example.com/dashboard';

        await handleMessage(message);

        // pathname /dashboard matches directly
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('falls back to full URL currentRoute when pathname does not match legacy name rule', async () => {
        // Customer set rule: contains "example.com" (legacy - matched against full URL)
        withRouteRule('^(.*example\\.com.*)$');
        navigateTo('/dashboard');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'http://example.com/dashboard';

        await handleMessage(message);

        // pathname /dashboard does NOT match .*example\.com.*
        // but currentRoute http://example.com/dashboard DOES match
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('matches full URL exact rule via currentRoute when analytics.page() called without name', async () => {
        // Customer set rule: equals "https://myapp.com/pricing"
        // analytics.page() called without a name → currentRoute = full URL
        withRouteRule('^(https:\\/\\/myapp\\.com\\/pricing)$');
        navigateTo('/pricing');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'https://myapp.com/pricing';

        await handleMessage(message);

        // pathname /pricing does NOT match the full URL regex
        // currentRoute https://myapp.com/pricing DOES match
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('does not match full URL exact rule when currentRoute is a pathname', async () => {
        // Same full URL rule, but analytics.page('Pricing') was called with a name
        // so currentRoute = "Pricing", not the full URL
        withRouteRule('^(https:\\/\\/myapp\\.com\\/pricing)$');
        navigateTo('/pricing');
        (Gist as unknown as Record<string, unknown>).currentRoute = 'Pricing';

        const result = await handleMessage(message);

        // Neither pathname /pricing nor currentRoute "Pricing" matches the full URL regex
        expect(result).toBe(false);
        expect(showMessage).not.toHaveBeenCalled();
      });
    });

    // --- Edge cases ---

    describe('edge cases', () => {
      it('handles regex with special characters in path', async () => {
        withRouteRule('^(.*\\/api\\/v2\\.0\\/users.*)$');
        navigateTo('/api/v2.0/users');

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('handles rule matching path with query params stripped by URL parsing', async () => {
        // URL parsing extracts only pathname, query params are stripped
        withRouteRule('^(\\/search)$');
        navigateTo('/search?q=test');

        await handleMessage(message);

        // pathname is /search (query params stripped by new URL().pathname)
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('handles rule matching path with hash stripped by URL parsing', async () => {
        withRouteRule('^(\\/docs)$');
        navigateTo('/docs#section-1');

        await handleMessage(message);

        // pathname is /docs (hash stripped by new URL().pathname)
        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('handles case-sensitive matching', async () => {
        withRouteRule('^(\\/Dashboard)$');
        navigateTo('/dashboard');

        const result = await handleMessage(message);

        // Regex is case-sensitive by default
        expect(result).toBe(false);
        expect(showMessage).not.toHaveBeenCalled();
      });

      it('handles empty route rule string as matching everything', async () => {
        // Empty regex matches everything
        withRouteRule('');
        navigateTo('/anything');

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });

      it('handles catch-all rule', async () => {
        withRouteRule('^(.*)$');
        navigateTo('/literally/any/path');

        await handleMessage(message);

        expect(showMessage).toHaveBeenCalledWith(message);
      });
    });
  });
});
