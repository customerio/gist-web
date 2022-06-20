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
      organizationId: config.organizationId,
      env: config.env === undefined ? "prod" : config.env,
      logging: config.logging === undefined ? false : config.logging,
      experiments: config.experiments === undefined ? false : config.experiments
    }
    this.currentMessages = [];
    this.overlayInstanceId = null;
    this.currentRoute = null;
    this.topics = [];
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
  }

  static embedMessage(message, elementId) {
    var message = embedMessage(message, elementId);
    return message.instanceId;
  }

  static showMessage(message) {
    var message = showMessage(message);
    return message ? message.instanceId : null;
  }

  static async subscribeToTopic(topic) {
    if (this.topics.indexOf(topic) == -1) {
      this.topics.push(topic);
      checkMessageQueue();
    }
  }

  static unsubscribeFromTopic(topic) {
    this.topics = this.topics.filter(item => item !== topic)
  }

  static clearTopics() {
    this.topics = [];
  }

  static getTopics() {
    return this.topics;
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

  static messageAction(message, action) {
    log(`Message action: ${message.currentRoute}, ${action} on ${message.instanceId}`);
    this.events.dispatch('messageAction', {message: message, action: action});
  }

}