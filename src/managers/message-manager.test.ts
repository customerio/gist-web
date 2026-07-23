import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { showMessage, embedMessage, hideMessage } from './message-manager';
import type { GistMessage } from '../types';

const mockGist = vi.hoisted(() => ({
  config: {
    env: 'prod' as const,
    siteId: 'test-site',
    dataCenter: 'us',
    isPreviewSession: false,
  },
  overlayInstanceId: null as string | null,
  currentMessages: [] as GistMessage[],
  isDocumentVisible: true,
  messageShown: vi.fn(),
  messageDismissed: vi.fn(),
  messageAction: vi.fn(),
  messageError: vi.fn(),
  showMessage: vi.fn(),
  events: { dispatch: vi.fn() },
}));

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../services/log-service', () => ({
  logMessageView: vi.fn(() => Promise.resolve({ status: 200 })),
  logUserMessageView: vi.fn(() => Promise.resolve({ status: 200 })),
}));
vi.mock('uuid', () => ({ v4: vi.fn(() => 'mock-uuid') }));
vi.mock('../services/settings', () => ({
  settings: {
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
vi.mock('./message-component-manager', () => ({
  loadOverlayComponent: vi.fn(),
  showOverlayComponent: vi.fn(),
  hideOverlayComponent: vi.fn(() => Promise.resolve()),
  removeOverlayComponent: vi.fn(),
  loadEmbedComponent: vi.fn(),
  showEmbedComponent: vi.fn(),
  hideEmbedComponent: vi.fn(),
  resizeComponent: vi.fn(),
  resizeTooltipComponent: vi.fn(),
  elementHasHeight: vi.fn(() => false),
  changeOverlayTitle: vi.fn(),
  sendDisplaySettingsToIframe: vi.fn(),
  loadTooltipComponent: vi.fn(),
  showTooltipComponent: vi.fn(() => Promise.resolve(true)),
  hideTooltipComponent: vi.fn(),
}));
vi.mock('./gist-properties-manager', () => ({
  resolveMessageProperties: vi.fn(() => ({
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
  })),
}));
vi.mock('./page-component-manager', () => ({
  positions: ['x-gist-top'],
  addPageElement: vi.fn(),
}));
vi.mock('./custom-attribute-manager', () => ({
  getAllCustomAttributes: vi.fn(() => new Map()),
}));
vi.mock('./queue-manager', () => ({
  checkMessageQueue: vi.fn(),
}));
vi.mock('./message-broadcast-manager', () => ({
  isMessageBroadcast: vi.fn(() => false),
  markBroadcastAsSeen: vi.fn(),
  markBroadcastAsDismissed: vi.fn(),
  isShowAlwaysBroadcast: vi.fn(() => false),
}));
vi.mock('./message-user-queue-manager', () => ({
  markUserQueueMessageAsSeen: vi.fn(),
  saveMessageState: vi.fn(),
  clearMessageState: vi.fn(),
  setMessageLoaded: vi.fn(),
}));
vi.mock('../utilities/message-utils', () => ({
  fetchMessageByInstanceId: vi.fn(),
  fetchMessageByElementId: vi.fn(() => null),
  isQueueIdAlreadyShowing: vi.fn(() => false),
  removeMessageByInstanceId: vi.fn(),
  updateMessageByInstanceId: vi.fn(),
  hasDisplayChanged: vi.fn(() => false),
  applyDisplaySettings: vi.fn(),
  getCurrentDisplayType: vi.fn(() => 'modal'),
}));
vi.mock('./preview-bar-manager', () => ({
  updatePreviewBarMessage: vi.fn(),
  updatePreviewBarStep: vi.fn(),
  clearPreviewBarMessage: vi.fn(),
}));
vi.mock('../utilities/preview-mode', () => ({
  PREVIEW_PARAM_ID: 'cioPreviewId',
  PREVIEW_SETTINGS_PARAM: 'cioPreviewSettings',
}));

vi.mock('../gist', () => ({ default: mockGist }));

describe('message-manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGist.overlayInstanceId = null;
    mockGist.currentMessages = [];
    mockGist.isDocumentVisible = true;
    mockGist.config.isPreviewSession = false;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('showMessage loads renderer without coi flag on regular pages', async () => {
    const { loadOverlayComponent } = await import('./message-component-manager');
    const message: GistMessage = { messageId: 'msg-1' };
    await showMessage(message);

    expect(vi.mocked(loadOverlayComponent)).toHaveBeenCalledWith(
      'https://view.test/index.html',
      message,
      expect.anything(),
      null
    );
  });

  it('showMessage loads renderer with coi flag on cross-origin-isolated pages', async () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const { loadOverlayComponent } = await import('./message-component-manager');
    const message: GistMessage = { messageId: 'msg-1' };
    await showMessage(message);

    expect(vi.mocked(loadOverlayComponent)).toHaveBeenCalledWith(
      'https://view.test/index.html?coi=1',
      message,
      expect.anything(),
      null
    );
  });

  it('embedMessage loads renderer with coi flag on cross-origin-isolated pages', async () => {
    vi.stubGlobal('crossOriginIsolated', true);
    const { loadEmbedComponent } = await import('./message-component-manager');
    const message: GistMessage = { messageId: 'msg-1' };
    embedMessage(message, 'my-element');

    expect(vi.mocked(loadEmbedComponent)).toHaveBeenCalledWith(
      'my-element',
      'https://view.test/index.html?coi=1',
      message,
      expect.anything(),
      null
    );
  });

  it('embedMessage assigns instanceId, sets overlay: false, stores elementId', () => {
    const message: GistMessage = { messageId: 'msg-1' };
    const result = embedMessage(message, 'my-element');

    expect(result).toBe(message);
    expect(message.instanceId).toBe('mock-uuid');
    expect(message.overlay).toBe(false);
    expect(message.elementId).toBe('my-element');
    expect(mockGist.currentMessages).toContain(message);
  });

  it('showMessage assigns instanceId, sets overlay: true, pushes to currentMessages', async () => {
    const message: GistMessage = { messageId: 'msg-1' };
    const result = await showMessage(message);

    expect(result).toBe(message);
    expect(message.instanceId).toBe('mock-uuid');
    expect(message.overlay).toBe(true);
    expect(mockGist.currentMessages).toContain(message);
    expect(mockGist.overlayInstanceId).toBe('mock-uuid');
  });

  it('showMessage returns null when document is hidden', async () => {
    mockGist.isDocumentVisible = false;
    const message: GistMessage = { messageId: 'msg-1' };
    const result = await showMessage(message);

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it('showMessage returns null when queueId is already showing', async () => {
    const { isQueueIdAlreadyShowing } = await import('../utilities/message-utils');
    vi.mocked(isQueueIdAlreadyShowing).mockReturnValue(true);
    const message: GistMessage = { messageId: 'msg-1', queueId: 'q-1' };
    const result = await showMessage(message);

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it('showMessage returns null when overlay is already active', async () => {
    mockGist.overlayInstanceId = 'existing-overlay';
    const message: GistMessage = { messageId: 'msg-1' };
    const result = await showMessage(message);

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it('embedMessage returns null if elementId already has a message', async () => {
    const { fetchMessageByElementId } = await import('../utilities/message-utils');
    vi.mocked(fetchMessageByElementId).mockReturnValue({
      messageId: 'existing',
      instanceId: 'existing-id',
    } as GistMessage);
    const message: GistMessage = { messageId: 'msg-1' };
    const result = embedMessage(message, 'taken-element');

    expect(result).toBeNull();
    expect(mockGist.currentMessages).toHaveLength(0);
  });

  it('hideMessage calls messageDismissed and resets state', async () => {
    const { hideOverlayComponent } = await import('./message-component-manager');
    const { removeMessageByInstanceId } = await import('../utilities/message-utils');

    const message: GistMessage = {
      messageId: 'msg-1',
      instanceId: 'inst-1',
      overlay: true,
    };
    mockGist.currentMessages = [message];
    mockGist.overlayInstanceId = 'inst-1';

    await hideMessage(message);

    expect(mockGist.messageDismissed).toHaveBeenCalledWith(message);
    expect(hideOverlayComponent).toHaveBeenCalled();
    expect(removeMessageByInstanceId).toHaveBeenCalledWith('inst-1');
    expect(mockGist.overlayInstanceId).toBeNull();
  });

  describe('handleGistEvents preview bar integration', () => {
    async function setupAndDispatchRouteLoaded(message: GistMessage, isPreviewSession: boolean) {
      const { fetchMessageByInstanceId } = await import('../utilities/message-utils');
      const { updatePreviewBarMessage } = await import('./preview-bar-manager');

      vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);
      mockGist.config.isPreviewSession = isPreviewSession;

      await showMessage(message);

      const event = new MessageEvent('message', {
        data: {
          gist: {
            method: 'routeLoaded',
            instanceId: message.instanceId,
            parameters: { route: '/step-1' },
          },
        },
        origin: 'https://renderer.test',
      });
      window.dispatchEvent(event);
      await vi.dynamicImportSettled();

      return { updatePreviewBarMessage };
    }

    it('calls updatePreviewBarMessage when isPreviewSession and livePreview are both true', async () => {
      const message: GistMessage = {
        messageId: 'msg-1',
        firstLoad: true,
        properties: { gist: { livePreview: true } },
      };

      const { updatePreviewBarMessage } = await setupAndDispatchRouteLoaded(message, true);

      expect(updatePreviewBarMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-1' })
      );
    });

    it('does not call updatePreviewBarMessage when livePreview is missing', async () => {
      const message: GistMessage = {
        messageId: 'msg-1',
        firstLoad: true,
        properties: { gist: {} },
      };

      const { updatePreviewBarMessage } = await setupAndDispatchRouteLoaded(message, true);

      expect(updatePreviewBarMessage).not.toHaveBeenCalled();
    });

    it('does not call updatePreviewBarMessage when isPreviewSession is false', async () => {
      const message: GistMessage = {
        messageId: 'msg-1',
        firstLoad: true,
        properties: { gist: { livePreview: true } },
      };

      const { updatePreviewBarMessage } = await setupAndDispatchRouteLoaded(message, false);

      expect(updatePreviewBarMessage).not.toHaveBeenCalled();
    });

    it('calls updatePreviewBarStep on changeMessageStep when isPreviewSession and livePreview', async () => {
      const { fetchMessageByInstanceId } = await import('../utilities/message-utils');
      const { updatePreviewBarStep } = await import('./preview-bar-manager');

      const message: GistMessage = {
        messageId: 'msg-1',
        properties: { gist: { livePreview: true } },
      };
      mockGist.config.isPreviewSession = true;

      await showMessage(message);
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

      const event = new MessageEvent('message', {
        data: {
          gist: {
            method: 'changeMessageStep',
            instanceId: message.instanceId,
            parameters: { messageStepName: 'step-2', displaySettings: undefined },
          },
        },
        origin: 'https://renderer.test',
      });
      window.dispatchEvent(event);
      await vi.dynamicImportSettled();

      expect(updatePreviewBarStep).toHaveBeenCalledWith('step-2', undefined);
    });

    it('does not call updatePreviewBarStep when livePreview is missing', async () => {
      const { fetchMessageByInstanceId } = await import('../utilities/message-utils');
      const { updatePreviewBarStep } = await import('./preview-bar-manager');

      const message: GistMessage = {
        messageId: 'msg-1',
        properties: { gist: {} },
      };
      mockGist.config.isPreviewSession = true;

      await showMessage(message);
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

      const event = new MessageEvent('message', {
        data: {
          gist: {
            method: 'changeMessageStep',
            instanceId: message.instanceId,
            parameters: { messageStepName: 'step-2', displaySettings: undefined },
          },
        },
        origin: 'https://renderer.test',
      });
      window.dispatchEvent(event);
      await vi.dynamicImportSettled();

      expect(updatePreviewBarStep).not.toHaveBeenCalled();
    });
  });

  describe('handleGistEvents loadPage cross-page continuation (INAPP-14575)', () => {
    let originalLocation: Location;

    beforeEach(() => {
      originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: {
          href: 'https://app.example.com/start',
          toString: () => 'https://app.example.com/start',
        },
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });

    async function setupMessage(persistent: boolean): Promise<GistMessage> {
      const { fetchMessageByInstanceId } = await import('../utilities/message-utils');
      const { resolveMessageProperties } = await import('./gist-properties-manager');

      vi.mocked(resolveMessageProperties).mockReturnValue({
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
        persistent,
        exitClick: false,
        hasCustomWidth: false,
      });

      const message: GistMessage = {
        messageId: 'tour-msg',
        queueId: 'q-tour',
        properties: { gist: {} },
      };
      await showMessage(message);
      vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);
      return message;
    }

    function dispatchLoadPageTap(
      instanceId: string | undefined,
      url: string,
      options?: Record<string, unknown>
    ) {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            gist: {
              method: 'tap',
              instanceId,
              parameters: { action: `gist://loadPage?url=${url}`, name: 'next', options },
            },
          },
          origin: 'https://renderer.test',
        })
      );
    }

    it('saves the target step before navigating when the tap carries a stepId', async () => {
      const { saveMessageState } = await import('./message-user-queue-manager');
      const message = await setupMessage(true);

      let resolveSave: () => void = () => {};
      vi.mocked(saveMessageState).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        })
      );

      const displaySettings = { displayType: 'tooltip', pageUrl: '/settings' };
      dispatchLoadPageTap(message.instanceId, '/settings', {
        stepId: 'step-2',
        displaySettings,
      });

      await vi.waitFor(() => {
        expect(saveMessageState).toHaveBeenCalledWith('q-tour', 'step-2', displaySettings);
      });
      // Still on the original page: navigation must wait for the save.
      expect(window.location.href).toBe('https://app.example.com/start');

      resolveSave();
      await vi.waitFor(() => {
        expect(window.location.href).toBe('/settings');
      });
    });

    it('navigates without saving when the tap has no stepId (plain openUrl)', async () => {
      const { saveMessageState } = await import('./message-user-queue-manager');
      const message = await setupMessage(true);

      dispatchLoadPageTap(message.instanceId, '/pricing', { name: 'cta' });

      await vi.waitFor(() => {
        expect(window.location.href).toBe('/pricing');
      });
      expect(saveMessageState).not.toHaveBeenCalled();
    });

    it('navigates without saving when the message is not persistent', async () => {
      const { saveMessageState } = await import('./message-user-queue-manager');
      const message = await setupMessage(false);

      dispatchLoadPageTap(message.instanceId, '/pricing', {
        stepId: 'step-2',
        displaySettings: { displayType: 'modal' },
      });

      await vi.waitFor(() => {
        expect(window.location.href).toBe('/pricing');
      });
      expect(saveMessageState).not.toHaveBeenCalled();
    });

    it('keeps legacy raw url parsing intact for urls with query params', async () => {
      const { saveMessageState } = await import('./message-user-queue-manager');
      const message = await setupMessage(true);
      vi.mocked(saveMessageState).mockResolvedValue(undefined);

      dispatchLoadPageTap(message.instanceId, 'https://other.example.com/a?b=1&c=2', {
        stepId: 'step-3',
        displaySettings: { displayType: 'modal' },
      });

      await vi.waitFor(() => {
        // Everything after ?url= is the redirect target — the stepId rides in
        // the structured tap options, never in the action URL.
        expect(window.location.href).toBe('https://other.example.com/a?b=1&c=2');
      });
      expect(saveMessageState).toHaveBeenCalledWith('q-tour', 'step-3', {
        displayType: 'modal',
      });
    });
  });

  describe('tooltip flow', () => {
    function addTargetElement(selector: string): HTMLElement {
      const id = selector.replace(/^#/, '');
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
      return el;
    }

    function tooltipProperties(elementId: string, tooltipPosition = 'bottom') {
      return {
        isEmbedded: false,
        elementId,
        hasRouteRule: false,
        routeRule: '',
        position: '',
        hasPosition: false,
        tooltipPosition,
        hasTooltipPosition: true,
        tooltipArrowColor: '#fff',
        shouldScale: false,
        campaignId: null,
        messageWidth: 280,
        overlayColor: '#00000033',
        persistent: false,
        exitClick: false,
        hasCustomWidth: false,
      };
    }

    beforeEach(async () => {
      document.body.innerHTML = '';
      const { isQueueIdAlreadyShowing, getCurrentDisplayType } =
        await import('../utilities/message-utils');
      vi.mocked(isQueueIdAlreadyShowing).mockReturnValue(false);
      vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');
    });

    it('routes to tooltip flow when message has tooltipPosition', async () => {
      const { loadTooltipComponent } = await import('./message-component-manager');
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));

      addTargetElement('#target-btn');

      const message: GistMessage = {
        messageId: 'tooltip-1',
        tooltipPosition: 'bottom',
        properties: { gist: { elementId: '#target-btn', tooltipPosition: 'bottom' } },
      };

      const result = await showMessage(message);

      expect(result).toBe(message);
      expect(message.instanceId).toBe('mock-uuid');
      expect(message.overlay).toBe(false);
      expect(message.shouldScale).toBe(false);
      expect(message.shouldResizeHeight).toBe(false);
      expect(mockGist.currentMessages).toContain(message);
      expect(mockGist.overlayInstanceId).toBeNull();
      expect(loadTooltipComponent).toHaveBeenCalled();
    });

    it('detects tooltip from properties when not set on message directly', async () => {
      const { loadTooltipComponent } = await import('./message-component-manager');
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));

      addTargetElement('#target-btn');

      const message: GistMessage = {
        messageId: 'tooltip-2',
        properties: { gist: { elementId: '#target-btn', tooltipPosition: 'top' } },
      };

      const result = await showMessage(message);

      expect(result).toBe(message);
      expect(message.tooltipPosition).toBe('bottom');
      expect(loadTooltipComponent).toHaveBeenCalled();
    });

    it('copies elementId from properties when not on message', async () => {
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));

      addTargetElement('#target-btn');

      const message: GistMessage = {
        messageId: 'tooltip-3',
        tooltipPosition: 'bottom',
        properties: { gist: { elementId: '#target-btn', tooltipPosition: 'bottom' } },
      };

      await showMessage(message);

      expect(message.elementId).toBe('#target-btn');
    });

    it('returns null and emits error when no target selector', async () => {
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties(''));

      const message: GistMessage = {
        messageId: 'tooltip-4',
        tooltipPosition: 'bottom',
      };

      const result = await showMessage(message);

      expect(result).toBeNull();
      expect(mockGist.messageError).toHaveBeenCalledWith(message);
      expect(mockGist.currentMessages).toHaveLength(0);
    });

    it('returns null and emits error when target element not in DOM', async () => {
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#nonexistent'));

      const message: GistMessage = {
        messageId: 'tooltip-5',
        tooltipPosition: 'bottom',
        properties: { gist: { elementId: '#nonexistent', tooltipPosition: 'bottom' } },
      };

      const result = await showMessage(message);

      expect(result).toBeNull();
      expect(mockGist.messageError).toHaveBeenCalledWith(message);
    });

    it('loads message for preview bar when target not found in live preview', async () => {
      const { loadTooltipComponent } = await import('./message-component-manager');
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#nonexistent'));

      mockGist.config.isPreviewSession = true;

      const message: GistMessage = {
        messageId: 'tooltip-preview',
        tooltipPosition: 'bottom',
        properties: {
          gist: { elementId: '#nonexistent', tooltipPosition: 'bottom', livePreview: true },
        },
      };

      const result = await showMessage(message);

      expect(result).toBe(message);
      expect(loadTooltipComponent).toHaveBeenCalled();
      expect(mockGist.messageError).not.toHaveBeenCalled();
      expect(mockGist.currentMessages).toContain(message);
    });

    it('returns null and emits error for invalid selector instead of throwing', async () => {
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('[invalid!'));

      const message: GistMessage = {
        messageId: 'tooltip-invalid',
        tooltipPosition: 'bottom',
        properties: { gist: { elementId: '[invalid!', tooltipPosition: 'bottom' } },
      };

      const result = await showMessage(message);

      expect(result).toBeNull();
      expect(mockGist.messageError).toHaveBeenCalledWith(message);
    });

    it('allows tooltip when an overlay is already active', async () => {
      const { loadTooltipComponent } = await import('./message-component-manager');
      const { resolveMessageProperties } = await import('./gist-properties-manager');
      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));

      addTargetElement('#target-btn');
      mockGist.overlayInstanceId = 'existing-overlay';

      const message: GistMessage = {
        messageId: 'tooltip-6',
        tooltipPosition: 'bottom',
        properties: { gist: { elementId: '#target-btn', tooltipPosition: 'bottom' } },
      };

      const result = await showMessage(message);

      expect(result).toBe(message);
      expect(loadTooltipComponent).toHaveBeenCalled();
      expect(mockGist.overlayInstanceId).toBe('existing-overlay');
    });

    it('dismisses existing tooltip on same target before showing new one', async () => {
      const { hideTooltipComponent } = await import('./message-component-manager');
      const { removeMessageByInstanceId } = await import('../utilities/message-utils');
      const { resolveMessageProperties } = await import('./gist-properties-manager');

      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));
      addTargetElement('#target-btn');

      const existing: GistMessage = {
        messageId: 'tooltip-old',
        instanceId: 'old-inst',
        tooltipPosition: 'top',
        elementId: '#target-btn',
      };
      mockGist.currentMessages = [existing];

      const message: GistMessage = {
        messageId: 'tooltip-new',
        tooltipPosition: 'bottom',
        properties: { gist: { elementId: '#target-btn', tooltipPosition: 'bottom' } },
      };

      await showMessage(message);

      expect(mockGist.messageDismissed).toHaveBeenCalledWith(existing);
      expect(hideTooltipComponent).toHaveBeenCalledWith(existing);
      expect(removeMessageByInstanceId).toHaveBeenCalledWith('old-inst');
    });

    it('allows multiple tooltips on different targets simultaneously', async () => {
      const { loadTooltipComponent } = await import('./message-component-manager');
      const { resolveMessageProperties } = await import('./gist-properties-manager');

      addTargetElement('#target-a');
      addTargetElement('#target-b');

      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-a'));
      const msg1: GistMessage = {
        messageId: 'tooltip-a',
        tooltipPosition: 'bottom',
        elementId: '#target-a',
        properties: { gist: { elementId: '#target-a', tooltipPosition: 'bottom' } },
      };
      await showMessage(msg1);

      vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-b'));
      const msg2: GistMessage = {
        messageId: 'tooltip-b',
        tooltipPosition: 'top',
        elementId: '#target-b',
        properties: { gist: { elementId: '#target-b', tooltipPosition: 'top' } },
      };
      await showMessage(msg2);

      expect(loadTooltipComponent).toHaveBeenCalledTimes(2);
      expect(mockGist.currentMessages).toHaveLength(2);
    });

    it('hideMessage calls resetTooltipState for tooltip messages', async () => {
      const { getCurrentDisplayType, removeMessageByInstanceId } =
        await import('../utilities/message-utils');
      const { hideTooltipComponent } = await import('./message-component-manager');
      vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');

      const message: GistMessage = {
        messageId: 'tooltip-7',
        instanceId: 'inst-tooltip',
        tooltipPosition: 'bottom',
      };
      mockGist.currentMessages = [message];

      await hideMessage(message);

      expect(mockGist.messageDismissed).toHaveBeenCalledWith(message);
      expect(hideTooltipComponent).toHaveBeenCalledWith(message);
      expect(removeMessageByInstanceId).toHaveBeenCalledWith('inst-tooltip');
    });

    describe('handleGistEvents tooltip integration', () => {
      async function setupTooltipAndDispatch(
        method: string,
        parameters: Record<string, unknown> = {}
      ) {
        const { fetchMessageByInstanceId, getCurrentDisplayType } =
          await import('../utilities/message-utils');
        const { resolveMessageProperties } = await import('./gist-properties-manager');
        const mocks = await import('./message-component-manager');

        vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));
        addTargetElement('#target-btn');

        const message: GistMessage = {
          messageId: 'tooltip-evt',
          tooltipPosition: 'bottom',
          elementId: '#target-btn',
          firstLoad: true,
          properties: { gist: { elementId: '#target-btn', tooltipPosition: 'bottom' } },
        };

        vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');
        await showMessage(message);
        vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

        const event = new MessageEvent('message', {
          data: {
            gist: {
              method,
              instanceId: message.instanceId,
              parameters: { route: '/step-1', ...parameters },
            },
          },
          origin: 'https://renderer.test',
        });
        window.dispatchEvent(event);
        await vi.dynamicImportSettled();

        return { message, mocks };
      }

      it('calls showTooltipComponent on routeLoaded for tooltip messages', async () => {
        const { mocks } = await setupTooltipAndDispatch('routeLoaded');
        expect(mocks.showTooltipComponent).toHaveBeenCalled();
        expect(mocks.showOverlayComponent).not.toHaveBeenCalled();
      });

      it('emits messageShown on first tooltip routeLoaded', async () => {
        await setupTooltipAndDispatch('routeLoaded');
        expect(mockGist.messageShown).toHaveBeenCalled();
      });

      it('does not emit messageShown when showTooltipComponent returns false', async () => {
        const { fetchMessageByInstanceId, getCurrentDisplayType } =
          await import('../utilities/message-utils');
        const { resolveMessageProperties } = await import('./gist-properties-manager');
        const mocks = await import('./message-component-manager');

        vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#target-btn'));
        vi.mocked(mocks.showTooltipComponent).mockResolvedValue(false);
        addTargetElement('#target-btn');

        const message: GistMessage = {
          messageId: 'tooltip-no-fit',
          tooltipPosition: 'bottom',
          elementId: '#target-btn',
          firstLoad: true,
          properties: { gist: { elementId: '#target-btn', tooltipPosition: 'bottom' } },
        };

        vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');
        await showMessage(message);
        vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

        const event = new MessageEvent('message', {
          data: {
            gist: {
              method: 'routeLoaded',
              instanceId: message.instanceId,
              parameters: { route: '/step-1' },
            },
          },
          origin: 'https://renderer.test',
        });
        window.dispatchEvent(event);
        await vi.dynamicImportSettled();

        expect(mocks.showTooltipComponent).toHaveBeenCalled();
        expect(mockGist.messageShown).not.toHaveBeenCalled();
        expect(mockGist.messageError).toHaveBeenCalledWith(message);
        expect(mocks.hideTooltipComponent).toHaveBeenCalledWith(message);
        expect(message.firstLoad).toBe(false);
      });

      it('calls resizeTooltipComponent on sizeChanged for tooltip messages', async () => {
        const { mocks } = await setupTooltipAndDispatch('sizeChanged', {
          width: 280,
          height: 150,
        });
        expect(mocks.resizeTooltipComponent).toHaveBeenCalled();
        expect(mocks.resizeComponent).not.toHaveBeenCalled();
      });

      it('calls resetTooltipState on error for tooltip messages', async () => {
        const { mocks } = await setupTooltipAndDispatch('error');
        expect(mockGist.messageError).toHaveBeenCalled();
        expect(mocks.hideTooltipComponent).toHaveBeenCalled();
      });

      it('resets tooltip on routeLoaded when target element is gone', async () => {
        const { fetchMessageByInstanceId, getCurrentDisplayType } =
          await import('../utilities/message-utils');
        const { resolveMessageProperties } = await import('./gist-properties-manager');
        vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#vanishing'));

        const target = addTargetElement('#vanishing');

        const message: GistMessage = {
          messageId: 'tooltip-vanish',
          tooltipPosition: 'bottom',
          elementId: '#vanishing',
          firstLoad: true,
          properties: { gist: { elementId: '#vanishing', tooltipPosition: 'bottom' } },
        };

        vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');
        await showMessage(message);
        vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

        target.remove();

        const event = new MessageEvent('message', {
          data: {
            gist: {
              method: 'routeLoaded',
              instanceId: message.instanceId,
              parameters: { route: '/step-1' },
            },
          },
          origin: 'https://renderer.test',
        });
        window.dispatchEvent(event);
        await vi.dynamicImportSettled();

        expect(mockGist.messageError).toHaveBeenCalledWith(message);
        expect(message.firstLoad).toBe(false);
      });

      it('keeps message alive in live preview when tooltip target is gone on routeLoaded', async () => {
        const { fetchMessageByInstanceId, getCurrentDisplayType } =
          await import('../utilities/message-utils');
        const { resolveMessageProperties } = await import('./gist-properties-manager');
        const { updatePreviewBarMessage } = await import('./preview-bar-manager');
        const mocks = await import('./message-component-manager');

        vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#missing-target'));

        mockGist.config.isPreviewSession = true;

        const message: GistMessage = {
          messageId: 'tooltip-preview-route',
          tooltipPosition: 'bottom',
          elementId: '#missing-target',
          firstLoad: true,
          properties: {
            gist: {
              elementId: '#missing-target',
              tooltipPosition: 'bottom',
              livePreview: true,
            },
          },
        };

        vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');
        await showMessage(message);
        vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

        const event = new MessageEvent('message', {
          data: {
            gist: {
              method: 'routeLoaded',
              instanceId: message.instanceId,
              parameters: { route: '/step-1' },
            },
          },
          origin: 'https://renderer.test',
        });
        window.dispatchEvent(event);
        await vi.dynamicImportSettled();

        expect(updatePreviewBarMessage).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'tooltip-preview-route' })
        );
        expect(mockGist.messageError).not.toHaveBeenCalled();
        expect(mocks.hideTooltipComponent).not.toHaveBeenCalled();
        expect(mocks.showTooltipComponent).not.toHaveBeenCalled();
        expect(mockGist.currentMessages).toContain(message);
      });

      it('gracefully handles invalid selector in routeLoaded instead of throwing', async () => {
        const { fetchMessageByInstanceId, getCurrentDisplayType } =
          await import('../utilities/message-utils');
        const { resolveMessageProperties } = await import('./gist-properties-manager');
        const mocks = await import('./message-component-manager');

        vi.mocked(resolveMessageProperties).mockReturnValue(tooltipProperties('#valid-target'));
        addTargetElement('#valid-target');

        const message: GistMessage = {
          messageId: 'tooltip-invalid-sel',
          tooltipPosition: 'bottom',
          elementId: '#valid-target',
          firstLoad: true,
          properties: { gist: { elementId: '#valid-target', tooltipPosition: 'bottom' } },
        };

        vi.mocked(getCurrentDisplayType).mockReturnValue('tooltip');
        await showMessage(message);
        vi.mocked(fetchMessageByInstanceId).mockReturnValue(message);

        message.firstLoad = true;
        message.properties = { gist: { elementId: '[invalid!', tooltipPosition: 'bottom' } };

        const event = new MessageEvent('message', {
          data: {
            gist: {
              method: 'routeLoaded',
              instanceId: message.instanceId,
              parameters: { route: '/step-1' },
            },
          },
          origin: 'https://renderer.test',
        });
        window.dispatchEvent(event);
        await vi.dynamicImportSettled();

        expect(mockGist.messageError).toHaveBeenCalledWith(message);
        expect(mocks.showTooltipComponent).not.toHaveBeenCalled();
        expect(message.firstLoad).toBe(false);
      });
    });
  });
});
