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
    RENDERER_HOST: 'https://renderer.test',
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
});
