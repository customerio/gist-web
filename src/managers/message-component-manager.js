import { log } from "../utilities/log";
import { v4 as uuidv4 } from 'uuid';
import { embedMessage } from "./message-manager";
import { resolveMessageProperties } from "./gist-properties-manager";
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
  document.body.insertAdjacentHTML('beforeend', component(url, message));
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

function showMessage() {
  var messageElement = document.querySelector("#gist-message");
  if (messageElement) messageElement.classList.add("visible");
}

function embed(url, message) {
  const wideOverlayPositions = ["x-gist-bottom", "x-gist-bottom", "x-gist-floating-top", "x-gist-floating-bottom"];
  var messageProperties = resolveMessageProperties(message);
  var maxWidthBreakpoint = 800;
  if (messageProperties.messageWidth > maxWidthBreakpoint) {
    maxWidthBreakpoint = messageProperties.messageWidth;
  }

  var messageWidth = messageProperties.messageWidth + "px";
  if (wideOverlayPositions.includes(messageProperties.elementId) && !messageProperties.hasCustomWidth) {
    messageWidth = "100%";
  }

  var template = `
  <div id="gist-embed">
    <style>
      #x-gist-floating-top, #x-gist-floating-top-left, #x-gist-floating-top-right {
        position: fixed;
        top: 0px;
        z-index: 1000000;
      }
      #x-gist-floating-bottom, #x-gist-floating-bottom-left, #x-gist-floating-bottom-right {
        position: fixed;
        bottom: 0px;
        z-index: 1000000;
      }
      #x-gist-bottom, #x-gist-top, #x-gist-floating-top, #x-gist-floating-bottom {
        left: 50%;
        transform: translate(-50%, 0%);
        width: '${messageWidth}';
      }
      #x-gist-floating-top-left, #x-gist-floating-top-right, #x-gist-floating-bottom-left, #x-gist-floating-bottom-right {
        width: '${messageWidth}';
      }
      #x-gist-floating-top-right, #x-gist-floating-bottom-right {
        right: 0px;
      }
      #gist-embed {
        position: relative;
        height: 100%;
        width: 100%;
      }
      #gist-embed-container {
        position: relative;
        height: 100%;
        width: 100%;
      }
      #gist-embed-container .gist-frame {
        height: 100%;
        width: 100%;
        border: none;
      }
      @media (max-width: '${maxWidthBreakpoint}px') {
        #x-gist-bottom, #x-gist-bottom, #x-gist-floating-top, #x-gist-floating-bottom, #x-gist-floating-top-left, #x-gist-floating-top-right, #x-gist-floating-bottom-left, #x-gist-floating-bottom-right {
          width: 100%;
        }
      }
    </style>
    <div id="gist-embed-container">
      <iframe class="gist-frame" src="${url}"></iframe>
    </div>
  </div>
  `;
  return template;
}

function component(url, message) {
  var messageProperties = resolveMessageProperties(message);
  var maxWidthBreakpoint = 600;
  if (messageProperties.messageWidth > maxWidthBreakpoint) {
    maxWidthBreakpoint = messageProperties.messageWidth;    
  }
  var template = `
    <div id="gist-embed-message">
    <style>
      #gist-overlay.background {
        position: fixed;
        z-index: 9999999998;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: '${messageProperties.overlayColor}';
        visibility: hidden;
      }
      #gist-overlay.background.visible {
        visibility: visible;
      }
      #gist-overlay.background.is-blacked-out {
        display: block;
      }
      #gist-message {
        width: '${messageProperties.messageWidth}px';
        position: absolute;
        border: none;
        opacity: 0;
        transition: opacity 0.3s ease-in-out;
        z-index: 9999999999;
        left: 50%;
        transform: translateX(-50%);
      }
      #gist-message.visible {
        opacity: 1;
      }
      #gist-message.center {
        transform: translate(-50%, -50%);
        top: 50%;
      }
      #gist-message.bottom {
        bottom: 0;
      }
      #gist-message.top {
        top: 0;
      }
      @media (max-width: '${maxWidthBreakpoint}px') {
        #gist-message {
          width: 100%;
        }
      }
    </style>
    <div id="gist-overlay" class="background">
      <iframe id="gist-message" class="message" src="${url}"></iframe>
    </div>
  </div>`;
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