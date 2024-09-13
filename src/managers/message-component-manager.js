import { log } from "../utilities/log";
import { v4 as uuidv4 } from 'uuid';
import { embedMessage } from "./message-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
import { embedHTMLTemplate } from "../templates/embed";
import { messageHTMLTemplate } from "../templates/message";
import { positions } from "./page-component-manager";
const delay = ms => new Promise(res => setTimeout(res, ms));
const wideOverlayPositions = ["x-gist-top", "x-gist-bottom", "x-gist-floating-top", "x-gist-floating-bottom"];

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

export function loadEmbedComponent(elementId, url, message, options) {
  var element = safelyFetchElement(elementId);
  if (element) {
    var messageElementId = getMessageElementId(message.instanceId);
    element.classList.add(messageElementId);
    var messageProperties = resolveMessageProperties(message);
    var messageWidth = messageProperties.messageWidth + "px";
    if (wideOverlayPositions.includes(elementId) && !messageProperties.hasCustomWidth) {
        messageWidth = "100%";
    }
    // Only set the width if it's a position offered by the SDK
    if (positions.includes(elementId)) {
      element.style.width = messageWidth;
    }
    if (!elementHasHeight(elementId)) {
      element.style.height = "0px";
    }
    element.innerHTML = embed(url, message, messageProperties);
    attachIframeLoadEvent(messageElementId, options);
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

export function resizeComponent(message, size) {
  var elementId = message.elementId ? message.elementId : getMessageElementId(message.instanceId);
  var element = safelyFetchElement(elementId);
  if (element) {
    var style = element.style;
    if (size.height > 0) {
      if (size.height > window.innerHeight) {
        var heightScale = 1 - ((size.height / window.innerHeight) - 1);
        if (message.shouldScale && heightScale >= 0.4) {
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

export function loadOverlayComponent(url, message, options) {
  document.body.insertAdjacentHTML('afterbegin', component(url, message));
  attachIframeLoadEvent(getMessageElementId(message.instanceId), options);
}

function attachIframeLoadEvent(elementId, options) {
  const iframe = document.getElementById(elementId);
  if (iframe) {
      iframe.onload = function() {
          sendOptionsToIframe(elementId, options); // Send the options when iframe loads
      };
  }
}

function sendOptionsToIframe(iframeId, options) {
  const iframe = document.getElementById(iframeId);
  if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ options: options }, '*');
  }
}

export function showOverlayComponent(message) {
  var mainMessageElement = document.querySelector("#gist-overlay");
  if (mainMessageElement) {
    mainMessageElement.classList.add("visible");
    var messageElement = document.querySelector(".gist-message");
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
  var message = document.querySelector(".gist-message");
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

export function changeOverlayTitle(instanceId, title) {
  var element = safelyFetchElement(getMessageElementId(instanceId));
  if (element) {
    element.title = title;
  }
}

function getMessageElementId(instanceId) {
  return `gist-${instanceId}`;
}

function showMessage() {
  var messageElement = document.querySelector(".gist-message");
  if (messageElement) messageElement.classList.add("visible");
}

function embed(url, message, messageProperties) {
  var template = embedHTMLTemplate(getMessageElementId(message.instanceId), messageProperties, url);
  return template;
}

function component(url, message) {
  var messageProperties = resolveMessageProperties(message);
  var template = messageHTMLTemplate(getMessageElementId(message.instanceId), messageProperties, url);
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