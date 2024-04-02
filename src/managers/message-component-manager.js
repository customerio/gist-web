import { log } from "../utilities/log";
import { v4 as uuidv4 } from 'uuid';
import { embedMessage } from "./message-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { embedHTMLTemplate } from "../templates/embed";
import { messageHTMLTemplate } from "../templates/message";
const delay = ms => new Promise(res => setTimeout(res, ms));

export function isElementLoaded(elementId) {
  var element = safelyFetchElement(elementId);
  if (element && element.classList.contains("gist-visible")) {
    return true;
  } else {
    return false;
  }
}

export async function preloadRenderer() {
  var preloadFrameId = `G${uuidv4().substring(0,8)}`;
  var preloadFrameElement = document.createElement("div");
  preloadFrameElement.setAttribute("id", preloadFrameId);
  preloadFrameElement.style.display = "none";
  document.body.appendChild(preloadFrameElement);
  
  await delay(5000);
  embedMessage({messageId: ""}, preloadFrameId);
}

export function loadEmbedComponent(elementId, url, message) {
  var element = safelyFetchElement(elementId);
  if (element) {
    if (!elementHasHeight(elementId)) {
      element.style.height = "0px";
    }
    element.innerHTML = embed(url, message);
  } else {
    log(`Message could not be embedded, elementId ${elementId} not found.`);
  }
}

export function showEmbedComponent(elementId) {
  var element = safelyFetchElement(elementId);
  if (element) {
    element.classList.add("gist-visible");
  }
}

export function hideEmbedComponent(elementId) {
  var element = safelyFetchElement(elementId);
  if (element) {
    element.classList.remove("gist-visible");
    element.style.removeProperty("height");
    element.innerHTML = "";
  }
}

export function elementHasHeight(elementId) {
  var element = safelyFetchElement(elementId);
  if (element) {
    return element.style && element.style.height && element.style.height != "0px";
  }
}

export function resizeComponent(elementId, size, shouldScale) {
  var element = safelyFetchElement(elementId);
  if (element) {
    var style = element.style;
    if (size.height > 0) {
      if (size.height > window.innerHeight) {
        var heightScale = 1 - ((size.height / window.innerHeight) - 1);
        if (shouldScale && heightScale >= 0.4) {
          style.height = `${size.height}px`;
          style.transform = `translateX(-50%) translateY(-50%) scale(${heightScale})`;
        } else {
          style.height = `${window.innerHeight}px`;
        }
      } else {
        style.height = `${size.height}px`;
      }
    }
  }
}

export function loadOverlayComponent(url, message) {
  document.body.insertAdjacentHTML('afterbegin', component(url, message));
}

export function showOverlayComponent(message) {
  var mainMessageElement = document.querySelector("#gist-overlay");
  if (mainMessageElement) {
    mainMessageElement.classList.add("visible");
    var messageElement = document.querySelector("#gist-message");
    if (message.position) {
      messageElement.classList.add(message.position);
    } else {
      messageElement.classList.add("center");
    }
    setTimeout(showMessage, 100);
  } else {
    removeOverlayComponent();
  }
}

export async function hideOverlayComponent() {
  var message = document.querySelector("#gist-message");
  if (message) {
    message.classList.remove("visible");
    await delay(300);
  }
  removeOverlayComponent();
}

export function removeOverlayComponent() {
  var mainMessageElement = document.querySelector("#gist-embed-message");
  if (mainMessageElement) {
    mainMessageElement.parentNode.removeChild(mainMessageElement);
  }
}

export function changeOverlayTitle(title) {
  var element = safelyFetchElement("gist-message");
  if (element) {
    element.title = title;
  }
}

function showMessage() {
  var messageElement = document.querySelector("#gist-message");
  if (messageElement) messageElement.classList.add("visible");
}

function embed(url, message) {
  var messageProperties = resolveMessageProperties(message);
  var template = embedHTMLTemplate(messageProperties, url);
  return template;
}

function component(url, message) {
  var messageProperties = resolveMessageProperties(message);
  var template = messageHTMLTemplate(messageProperties, url);
  return template;
}

function safelyFetchElement(elementId) {
  try {
    var element = document.querySelector(`#${elementId}`);
    if (element) {
      return element;
    } else {
      return null;
    }
  } catch {
    return null;
  }
}