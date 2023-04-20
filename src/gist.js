import EventEmitter from "./utilities/event-emitter";
import { log } from "./utilities/log";
import { startQueueListener, checkMessageQueue } from "./managers/queue-manager";
import { setUserToken, clearUserToken, useGuestSession } from "./managers/user-manager";
import { showMessage, embedMessage, hideMessage } from "./managers/message-manager";

export default class {
  static async setup(config) {
    this.events = new EventEmitter();
    this.config = {
      useGuestSession: config.useGuestSession === undefined ? false : config.useGuestSession,
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

    log(`Setup complete on ${this.config.env} environment.`);

    if (this.config.useGuestSession) {
      useGuestSession();
    }
    await startQueueListener();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.isDocumentVisible = false;
      } else  {
        this.isDocumentVisible = true;
        checkMessageQueue();
      }
    }, false);
  }

  static async setCurrentRoute(route) {
    this.currentRoute = route;
    log(`Current route set to: ${route}`);
    checkMessageQueue();
  }

  static async setUserToken(userToken, expiryDate) {
    setUserToken(userToken, expiryDate);
    await startQueueListener();
  }

  static async clearUserToken() {
    clearUserToken();
    if (this.config.useGuestSession) {
      useGuestSession();
    }
    await startQueueListener();
  }

  static dismissMessage(instanceId) {
    hideMessage(instanceId);
    removePersistentMessage(instanceId);
    checkMessageQueue();
  }

  static async embedMessage(message, elementId) {
    var message = await embedMessage(message, elementId);
    return message.instanceId;
  }

  static async showMessage(message) {
    var message = await showMessage(message);
    return message ? message.instanceId : null;
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