import EventEmitter from './utilities/event-emitter';
import { log } from './utilities/log';
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
import { renderEmbed, mountEmbedsFromDom, clearEmbedState } from './managers/embed-manager';
import { setupDebugOverlay } from './utilities/debug-mode';
import {
  getInboxMessagesFromLocalStore,
  updateInboxMessageOpenState,
  removeInboxMessage,
} from './managers/inbox-message-manager';
import { isInboxEnabled, initializeInboxFromCache } from './managers/inbox-config-manager';
import { destroyInbox } from './managers/inbox-component-manager';
import type { GistConfig, GistMessage, DisplaySettings, ColorScheme, EmbedPayload } from './types';
import type { InboxMessage } from './managers/inbox-message-manager';

const ROUTE_INIT_GRACE_PERIOD_MS = 2000;

export default class Gist {
  static events: EventEmitter;
  static config: GistConfig;
  static initialized: boolean;
  static currentMessages: GistMessage[];
  static overlayInstanceId: string | null;
  static currentRoute: string | null;
  static routeInitialized: boolean;
  static isDocumentVisible: boolean;

  static async setup(config: GistConfig): Promise<void> {
    if (this.initialized) {
      log('Gist SDK already initialized, skipping setup.');
      return;
    }
    this.initialized = true;
    this.events = new EventEmitter();
    this.config = {
      useAnonymousSession: config.useAnonymousSession ?? false,
      siteId: config.siteId,
      dataCenter: config.dataCenter,
      env: config.env ?? 'prod',
      logging: config.logging ?? false,
      experiments: config.experiments ?? false,
      colorScheme: config.colorScheme ?? 'default',
      embedOnly: config.embedOnly ?? false,
    };
    this.currentMessages = [];
    clearAllTooltipHandles();
    this.overlayInstanceId = null;
    this.currentRoute = null;
    this.routeInitialized = false;
    this.isDocumentVisible = true;
    // Embed-only hosts run none of the delivery machinery: there is no user to
    // pull a queue for, no inbox, and a stray preview param on a customer's
    // page must not raise a preview bar. The debug overlay stays available —
    // it only activates on an explicit query param, and it is as useful for
    // diagnosing an embed as anything else.
    this.config.isPreviewSession = this.config.embedOnly ? false : setupPreview();
    setupDebugOverlay();
    clearExpiredFromLocalStore();
    if (!this.config.embedOnly) {
      initializeInboxFromCache();
    }
    if (this.config.colorScheme === 'auto') {
      startColorSchemeObserver();
    }

    log(
      `Setup complete on ${this.config.env} environment${this.config.embedOnly ? ' in embed-only mode' : ''}.`
    );

    if (this.config.embedOnly) {
      return;
    }

    if (
      !this.config.isPreviewSession &&
      this.config.useAnonymousSession &&
      !new URLSearchParams(location.search).has('ajs_uid')
    ) {
      useGuestSession();
    }

    await startQueueListener();

    setTimeout(() => {
      if (!this.routeInitialized) {
        this.routeInitialized = true;
        void checkMessageQueue();
      }
    }, ROUTE_INIT_GRACE_PERIOD_MS);

    document.addEventListener(
      'visibilitychange',
      async () => {
        if (document.visibilityState === 'hidden') {
          this.isDocumentVisible = false;
        } else {
          this.isDocumentVisible = true;
          await checkMessageQueue();
        }
      },
      false
    );
  }

  static setupDebugOverlay(): void {
    setupDebugOverlay();
  }

  static async setCurrentRoute(route: string): Promise<void> {
    this.routeInitialized = true;
    this.currentRoute = route;
    log(`Current route set to: ${route}`);
    await checkCurrentMessagesAfterRouteChange();
    await checkMessageQueue();
    this.events?.dispatch('routeChanged', route);
  }

  static async setUserToken(userToken: string, expiryDate?: Date): Promise<void> {
    if (this.config.isPreviewSession) return;
    // Embed-only mode owns no user state: identifying a visitor must not bring
    // the queue up behind the host's back, which is what setting a token
    // otherwise does.
    if (this.config.embedOnly) {
      log('Embed-only mode, ignoring user token.');
      return;
    }
    setUserToken(userToken, expiryDate);
    stopSSEListener(true);
    await startQueueListener();
  }

  static setUserLocale(userLocale: string): void {
    setUserLocale(userLocale);
  }

  static setColorScheme(colorScheme: ColorScheme): void {
    this.config.colorScheme = colorScheme;
    applyColorSchemeChange();
    log(`Color scheme set to: ${colorScheme}`);
  }

  static setCustomAttribute(key: string, value: unknown): boolean {
    return setCustomAttribute(key, value);
  }

  static clearCustomAttributes(): void {
    clearCustomAttributes();
  }

  static removeCustomAttribute(key: string): boolean {
    return removeCustomAttribute(key);
  }

  static async clearUserToken(): Promise<void> {
    if (this.config.isPreviewSession) return;
    if (this.config.embedOnly) {
      log('Embed-only mode, ignoring user token reset.');
      return;
    }
    clearUserToken();
    destroyInbox();
    if (this.config.useAnonymousSession) {
      useGuestSession();
    }
    stopSSEListener(true);
    await startQueueListener();
  }

  static async dismissMessage(instanceId: string): Promise<void> {
    const message = fetchMessageByInstanceId(instanceId);
    if (!message) return;
    await removePersistentMessage(message);
    await logBroadcastDismissedLocally(message);
    await hideMessage(message);
    await checkMessageQueue();
  }

  static async embedMessage(message: GistMessage, elementId: string): Promise<string | null> {
    const messageResponse = embedMessage(message, elementId);
    return messageResponse?.instanceId ?? null;
  }

  /**
   * Renders a message the host supplies directly — no queue, no campaign —
   * into an element on the page, honouring the payload's frequency rule.
   * Auto-initializes the SDK in embed-only mode when nothing else has set it up.
   */
  static async embed(payload: EmbedPayload): Promise<string | null> {
    if (!this.initialized) {
      await this.setup({ siteId: payload.siteId ?? '', embedOnly: true });
    }
    return renderEmbed(payload);
  }

  /**
   * Renders every embed payload declared on the page. Safe to call more than
   * once: already-rendered embeds are skipped, so a host can call it again
   * after injecting markup.
   */
  static async mountEmbeds(): Promise<string[]> {
    if (!this.initialized) {
      await this.setup({ siteId: '', embedOnly: true });
    }
    return mountEmbedsFromDom();
  }

  /** Forgets an embed's stored frequency state so it becomes eligible again. */
  static resetEmbed(embedId: string): void {
    clearEmbedState(embedId);
  }

  static async showMessage(message: GistMessage): Promise<string | null> {
    const messageResponse = await showMessage(message);
    return messageResponse?.instanceId ?? null;
  }

  static updateMessageDisplaySettings(
    instanceId: string,
    displaySettings: DisplaySettings
  ): boolean {
    const message = fetchMessageByInstanceId(instanceId);
    if (message) {
      message.displaySettings = displaySettings;
      sendDisplaySettingsToIframe(message);
      return true;
    }
    return false;
  }

  // Actions

  static messageShown(message: GistMessage): void {
    log(`Message shown: ${message.messageId}`);
    this.events.dispatch('messageShown', message);
  }

  static messageDismissed(message: GistMessage | null): void {
    if (message !== null) {
      log(`Message dismissed: ${message.messageId}`);
      this.events.dispatch('messageDismissed', message);
    }
  }

  static messageError(message: GistMessage): void {
    log(`Message error: ${message.messageId}`);
    this.events.dispatch('messageError', message);
  }

  static messageAction(message: GistMessage, action: string, name: string): void {
    log(
      `Message action: ${message.currentRoute}, ${action} with name ${name} on ${message.instanceId}`
    );
    this.events.dispatch('messageAction', { message, action, name });
  }

  // Inbox Messages

  static async getInboxUnopenedCount(): Promise<number> {
    const messages = await getInboxMessagesFromLocalStore();
    return messages.filter((msg) => !msg.opened).length;
  }

  static async getInboxMessages(): Promise<InboxMessage[]> {
    return await getInboxMessagesFromLocalStore();
  }

  static async updateInboxMessageOpenState(queueId: string, opened: boolean): Promise<void> {
    return await updateInboxMessageOpenState(queueId, opened);
  }

  static async removeInboxMessage(queueId: string): Promise<void> {
    return await removeInboxMessage(queueId);
  }

  static isInboxEnabled(): boolean {
    return isInboxEnabled();
  }
}
