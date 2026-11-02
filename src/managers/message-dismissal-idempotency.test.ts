import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GistConfig, GistMessage } from '../types';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));
vi.mock('../utilities/local-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utilities/local-storage')>();
  return { ...actual, clearExpiredFromLocalStore: vi.fn() };
});
vi.mock('../utilities/debug-mode', () => ({ setupDebugOverlay: vi.fn() }));
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
vi.mock('../services/log-service', () => ({
  logMessageView: vi.fn(() => Promise.resolve({ status: 200 })),
  logUserMessageView: vi.fn(() => Promise.resolve({ status: 200 })),
}));
vi.mock('./queue-manager', () => ({
  startQueueListener: vi.fn(() => Promise.resolve()),
  checkMessageQueue: vi.fn(() => Promise.resolve()),
  checkCurrentMessagesAfterRouteChange: vi.fn(() => Promise.resolve()),
  stopSSEListener: vi.fn(),
}));
vi.mock('./user-manager', () => ({
  setUserToken: vi.fn(),
  clearUserToken: vi.fn(),
  useGuestSession: vi.fn(),
  getUserToken: vi.fn(() => null),
}));
vi.mock('./locale-manager', () => ({ setUserLocale: vi.fn() }));
vi.mock('./message-broadcast-manager', () => ({
  isMessageBroadcast: vi.fn(() => false),
  markBroadcastAsSeen: vi.fn(() => Promise.resolve()),
  markBroadcastAsDismissed: vi.fn(() => Promise.resolve()),
  isShowAlwaysBroadcast: vi.fn(() => false),
}));
vi.mock('./message-user-queue-manager', () => ({
  markUserQueueMessageAsSeen: vi.fn(() => Promise.resolve()),
  saveMessageState: vi.fn(),
  clearMessageState: vi.fn(() => Promise.resolve()),
  setMessageLoaded: vi.fn(),
  setMessageSnoozed: vi.fn(() => Promise.resolve()),
}));
vi.mock('./embed-manager', () => ({
  renderEmbed: vi.fn(),
  renderEmbeds: vi.fn(),
  readEmbedPayloads: vi.fn(() => []),
  clearEmbedState: vi.fn(),
  recordEmbedShown: vi.fn(),
  recordEmbedDismissed: vi.fn(),
  snoozeEmbed: vi.fn(),
  releaseEmbedClaim: vi.fn(),
}));
vi.mock('./preview-bar-manager', () => ({
  updatePreviewBarMessage: vi.fn(),
  updatePreviewBarStep: vi.fn(),
  clearPreviewBarMessage: vi.fn(),
  flushPreviewDisplaySettings: vi.fn(() => Promise.resolve()),
}));
vi.mock('./inbox-message-manager', () => ({
  getInboxMessagesFromLocalStore: vi.fn(() => Promise.resolve([])),
  updateInboxMessageOpenState: vi.fn(),
  removeInboxMessage: vi.fn(),
}));
vi.mock('./inbox-config-manager', () => ({
  isInboxEnabled: vi.fn(() => false),
  initializeInboxFromCache: vi.fn(),
}));
vi.mock('./inbox-component-manager', () => ({ destroyInbox: vi.fn() }));

import Gist from '../gist';
import EventEmitter from '../utilities/event-emitter';
import { showMessage } from './message-manager';
import { showOverlayComponent } from './message-component-manager';
import { logUserMessageView } from '../services/log-service';

type DismissedEvent = GistMessage & { dismissReason?: string };

describe('dismissal idempotency during the fade-out', () => {
  let dismissedEvents: DismissedEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    document.body.innerHTML = '';
    Gist.config = {
      siteId: 'test-site',
      env: 'prod',
      dataCenter: 'us',
      isPreviewSession: false,
    } as GistConfig;
    Gist.currentMessages = [];
    Gist.overlayInstanceId = null;
    Gist.isDocumentVisible = true;
    Gist.events = new EventEmitter();
    dismissedEvents = [];
    Gist.events.on('messageDismissed', (event) => {
      dismissedEvents.push(event as DismissedEvent);
    });
  });

  afterEach(async () => {
    await vi.runAllTimersAsync();
    vi.useRealTimers();
  });

  async function showOverlayMessage(
    gistProperties: Record<string, unknown>,
    queueId?: string
  ): Promise<GistMessage> {
    const message: GistMessage = {
      messageId: 'msg-1',
      ...(queueId ? { queueId } : {}),
      properties: { gist: gistProperties },
    };
    const shown = await showMessage(message);
    expect(shown).not.toBeNull();
    showOverlayComponent(shown!);
    return shown!;
  }

  function dispatchCloseTap(instanceId: string): void {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          gist: {
            method: 'tap',
            instanceId,
            parameters: { action: 'gist://close', name: 'close' },
          },
        },
        origin: 'https://renderer.test',
      })
    );
  }

  it('two backdrop clicks 100 ms apart dismiss the message once', async () => {
    await showOverlayMessage({ exitClick: true });
    await vi.advanceTimersByTimeAsync(1000);
    const overlay = document.getElementById('gist-overlay');
    expect(overlay).not.toBeNull();

    overlay!.dispatchEvent(new Event('click'));
    await vi.advanceTimersByTimeAsync(100);
    overlay!.dispatchEvent(new Event('click'));
    await vi.runAllTimersAsync();

    expect(dismissedEvents).toHaveLength(1);
    expect(dismissedEvents[0].dismissReason).toBe('dismissed');
    expect(Gist.currentMessages).toHaveLength(0);
  });

  it('two Escape presses 100 ms apart dismiss the message once', async () => {
    await showOverlayMessage({ exitClick: true });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await vi.advanceTimersByTimeAsync(100);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await vi.runAllTimersAsync();

    expect(dismissedEvents).toHaveLength(1);
    expect(dismissedEvents[0].dismissReason).toBe('dismissed');
    expect(Gist.currentMessages).toHaveLength(0);
  });

  it('two gist://close taps 100 ms apart dismiss the message once', async () => {
    const message = await showOverlayMessage({});

    dispatchCloseTap(message.instanceId!);
    await vi.advanceTimersByTimeAsync(100);
    dispatchCloseTap(message.instanceId!);
    await vi.runAllTimersAsync();

    expect(dismissedEvents).toHaveLength(1);
    expect(dismissedEvents[0].dismissReason).toBe('dismissed');
    expect(Gist.currentMessages).toHaveLength(0);
  });

  it('a persistent message closed twice reports its view once', async () => {
    const message = await showOverlayMessage({ persistent: true }, 'queue-1');

    dispatchCloseTap(message.instanceId!);
    await vi.advanceTimersByTimeAsync(100);
    dispatchCloseTap(message.instanceId!);
    await vi.runAllTimersAsync();

    expect(dismissedEvents).toHaveLength(1);
    expect(dismissedEvents[0].dismissReason).toBe('dismissed');
    expect(vi.mocked(logUserMessageView)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logUserMessageView)).toHaveBeenCalledWith('queue-1');
  });
});
