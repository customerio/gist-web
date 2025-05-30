import EventEmitter from "./utilities/event-emitter";
import { log } from "./utilities/log";
import { startQueueListener, checkMessageQueue, stopSSEListener } from "./managers/queue-manager";
import { setUserToken, clearUserToken, useGuestSession } from "./managers/user-manager";
import { showMessage, embedMessage, hideMessage, removePersistentMessage, fetchMessageByInstanceId, logBroadcastDismissedLocally } from "./managers/message-manager";
import { setUserLocale } from "./managers/locale-manager";
import { setupPreview } from "./utilities/preview-mode";

export default class {
  static async setup(config) {
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

    log(`Setup complete on ${this.config.env} environment.`);

    if (!this.config.isPreviewSession && this.config.useAnonymousSession) {
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
    await startQueueListener();
  }

  static setUserLocale(userLocale) {
    setUserLocale(userLocale);
  }

  static async clearUserToken() {
    if (this.config.isPreviewSession) return;
    clearUserToken();
    if (this.config.useAnonymousSession) {
      useGuestSession();
    }
    stopSSEListener();
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
    var messageResponse = await embedMessage(message, elementId);
    return messageResponse ? messageResponse.instanceId : null;
  }

  static async showMessage(message) {
    var messageResponse = await showMessage(message);
    return messageResponse ? messageResponse.instanceId : null;
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

}
