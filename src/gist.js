import EventEmitter from "./utilities/event-emitter";
import { log } from "./utilities/log";
import { startQueueListener } from "./managers/queue-manager";
import { setUserToken, clearUserToken, getUserToken, useGuestSession } from "./managers/user-manager";
import { showMessage, embedMessage, hideMessage } from "./managers/message-manager";

export default class {
  static async setup(config) {
    this.events = new EventEmitter();
    this.config = {
      useGuestSession: config.useGuestSession === undefined ? false : config.useGuestSession,
      organizationId: config.organizationId,
      env: config.env === undefined ? "prod" : config.env,
      logging: config.logging === undefined ? false : config.logging
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
    startQueueListener();

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.isDocumentVisible = false;
      } else  {
        this.isDocumentVisible = true;
      }
    }, false);
  }

  static setCurrentRoute(route) {
    this.currentRoute = route;
    log(`Current route set to: ${route}`);
  }

  static setUserToken(userToken, expiryDate) {
    if (getUserToken() === undefined) {
      setUserToken(userToken, expiryDate)
      startQueueListener();
    } else {
      setUserToken(userToken, expiryDate)
    }
  }

  static clearUserToken() {
    clearUserToken();
    if (this.config.useGuestSession) {
      useGuestSession();
    }
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

  static subscribeToTopic(topic) {
    if (this.topics.indexOf(topic) == -1) {
      this.topics.push(topic);
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