import EventEmitter from "./utilities/event-emitter";
import { log } from "./utilities/log";
import { clearExpiredFromLocalStore } from "./utilities/local-storage";
import { startQueueListener, checkMessageQueue, stopSSEListener } from "./managers/queue-manager";
import { setUserToken, clearUserToken, useGuestSession } from "./managers/user-manager";
import { showMessage, embedMessage, hideMessage, removePersistentMessage, logBroadcastDismissedLocally } from "./managers/message-manager";
import { fetchMessageByInstanceId } from "./utilities/message-utils";
import { sendDisplaySettingsToIframe } from "./managers/message-component-manager";
import { setUserLocale } from "./managers/locale-manager";
import { setCustomAttribute, clearCustomAttributes, removeCustomAttribute } from "./managers/custom-attribute-manager";
import { setupPreview } from "./utilities/preview-mode";
import {
  getInboxMessagesFromLocalStore,
  updateInboxMessageOpenState,
  removeInboxMessage
} from "./managers/inbox-message-manager";

export default class {
  static async setup(config) {
    if (this.initialized) {
      log("Gist SDK already initialized, skipping setup.");
      return;
    }
    this.initialized = true;
    this.events = new EventEmitter();
    this.config = {
      useAnonymousSession: config.useAnonymousSession === undefined ? false : config.useAnonymousSession,
      siteId: config.siteId,
      dataCenter: config.dataCenter,
      env: config.env === undefined ? "prod" : config.env,
      logging: config.logging === undefined ? false : config.logging,
      experiments: config.experiments === undefined ? false : config.experiments
    }
    this.currentMessages = [];
    this.overlayInstanceId = null;
    this.currentRoute = null;
    this.isDocumentVisible = true;
    this.config.isPreviewSession = setupPreview();
    clearExpiredFromLocalStore();

    log(`Setup complete on ${this.config.env} environment.`);

    if (!this.config.isPreviewSession && this.config.useAnonymousSession && !new URLSearchParams(location.search).has('ajs_uid')) {
      useGuestSession();
    }

    await startQueueListener();

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "hidden") {
        this.isDocumentVisible = false;
      } else  {
        this.isDocumentVisible = true;
        await checkMessageQueue();
      }
    }, false);
  }

  static async setCurrentRoute(route) {
    this.currentRoute = route;
    log(`Current route set to: ${route}`);
    await checkMessageQueue();
  }

  static async setUserToken(userToken, expiryDate) {
    if (this.config.isPreviewSession) return;
    setUserToken(userToken, expiryDate);
    stopSSEListener(true);
    await startQueueListener();
  }

  static setUserLocale(userLocale) {
    setUserLocale(userLocale);
  }

  static setCustomAttribute(key, value) {
    return setCustomAttribute(key, value);
  }

  static clearCustomAttributes() {
    clearCustomAttributes();
  }

  static removeCustomAttribute(key) {
    return removeCustomAttribute(key);
  }

  static async clearUserToken() {
    if (this.config.isPreviewSession) return;
    clearUserToken();
    if (this.config.useAnonymousSession) {
      useGuestSession();
    }
    stopSSEListener(true);
    await startQueueListener();
  }

  static async dismissMessage(instanceId) {
    var message = fetchMessageByInstanceId(instanceId);
    await hideMessage(message);
    await removePersistentMessage(message);
    await logBroadcastDismissedLocally(message);
    await checkMessageQueue();
  }

  static async embedMessage(message, elementId) {
    var messageResponse = embedMessage(message, elementId);
    return messageResponse ? messageResponse.instanceId : null;
  }

  static async showMessage(message) {
    var messageResponse = await showMessage(message);
    return messageResponse ? messageResponse.instanceId : null;
  }

  static updateMessageDisplaySettings(instanceId, displaySettings) {
    var message = fetchMessageByInstanceId(instanceId);
    if (message) {
      message.displaySettings = displaySettings;
      sendDisplaySettingsToIframe(message);
      return true;
    }
    return false;
  }

  // Actions

  static messageShown(message) {
    log(`Message shown: ${message.messageId}`);
    this.events.dispatch('messageShown', message);
  }

  static messageDismissed(message) {
    if (message !== null) {
      log(`Message dismissed: ${message.messageId}`);
      this.events.dispatch('messageDismissed', message);
    }
  }

  static messageError(message) {
    log(`Message error: ${message.messageId}`);
    this.events.dispatch('messageError', message);
  }

  static messageAction(message, action, name) {
    log(`Message action: ${message.currentRoute}, ${action} with name ${name} on ${message.instanceId}`);
    this.events.dispatch('messageAction', {message: message, action: action, name: name});
  }

  // Inbox Messages

  static async getInboxUnopenedCount() {
    const messages = await getInboxMessagesFromLocalStore();
    return messages.filter(msg => !msg.opened).length;
  }

  static async getInboxMessages() {
    return await getInboxMessagesFromLocalStore();
  }

  static async updateInboxMessageOpenState(queueId, opened) {
    return await updateInboxMessageOpenState(queueId, opened);
  }

  static async removeInboxMessage(queueId) {
    return await removeInboxMessage(queueId);
  }

}
