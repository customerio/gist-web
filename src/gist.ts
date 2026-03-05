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
import { sendDisplaySettingsToIframe } from './managers/message-component-manager';
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
import type { GistConfig, GistMessage, DisplaySettings } from './types';
import type { InboxMessage } from './managers/inbox-message-manager';

export default class Gist {
  static events: EventEmitter;
  static config: GistConfig;
  static initialized: boolean;
  static currentMessages: GistMessage[];
  static overlayInstanceId: string | null;
  static currentRoute: string | null;
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
    };
    this.currentMessages = [];
    this.overlayInstanceId = null;
    this.currentRoute = null;
    this.isDocumentVisible = true;
    this.config.isPreviewSession = setupPreview();
    clearExpiredFromLocalStore();

    log(`Setup complete on ${this.config.env} environment.`);

    if (
      !this.config.isPreviewSession &&
      this.config.useAnonymousSession &&
      !new URLSearchParams(location.search).has('ajs_uid')
    ) {
      useGuestSession();
    }

    await startQueueListener();

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

  static async setCurrentRoute(route: string): Promise<void> {
    this.currentRoute = route;
    log(`Current route set to: ${route}`);
    await checkCurrentMessagesAfterRouteChange();
    await checkMessageQueue();
  }

  static async setUserToken(userToken: string, expiryDate?: Date): Promise<void> {
    if (this.config.isPreviewSession) return;
    setUserToken(userToken, expiryDate);
    stopSSEListener(true);
    await startQueueListener();
  }

  static setUserLocale(userLocale: string): void {
    setUserLocale(userLocale);
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
    clearUserToken();
    if (this.config.useAnonymousSession) {
      useGuestSession();
    }
    stopSSEListener(true);
    await startQueueListener();
  }

  static async dismissMessage(instanceId: string): Promise<void> {
    const message = fetchMessageByInstanceId(instanceId);
    if (!message) return;
    await hideMessage(message);
    await removePersistentMessage(message);
    await logBroadcastDismissedLocally(message);
    await checkMessageQueue();
  }

  static async embedMessage(message: GistMessage, elementId: string): Promise<string | null> {
    const messageResponse = embedMessage(message, elementId);
    return messageResponse?.instanceId ?? null;
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
}
