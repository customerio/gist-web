import { log } from "../utilities/log";
import { settings } from "../services/settings";
import Gist from '../gist';

export function preloadRenderer() {
  var iframeElement = document.createElement("iframe");
  iframeElement.setAttribute("src", `${settings.GIST_VIEW_ENDPOINT[Gist.config.env]}/index.html`);
  iframeElement.style.display = "none";
  document.body.appendChild(iframeElement);
}

export function loadEmbedComponent(elementId, url) {
  var element = document.querySelector(getElementId(elementId));
  if (element) {
    if (!elementHasHeight(elementId)) {
      element.style.height = "0px";
    }
    element.innerHTML = embed(url);
  } else {
    log(`Message could not be embedded, elementId ${elementId} not found.`);
  }
}

export function showEmbedComponent(elementId) {
  var element = document.querySelector(getElementId(elementId));
  if (element) {
    element.classList.add("gist-visible");
  }
}

export function hideEmbedComponent(elementId) {
  var element = document.querySelector(getElementId(elementId));
  if (element) {
    element.classList.remove("gist-visible");
    element.style.removeProperty("height");
    element.innerHTML = "";
  }
}

export function elementHasHeight(elementId) {
  var element = document.querySelector(getElementId(elementId));
  if (element) {
    return element.style && element.style.height && element.style.height != "0px";
  }
}

export function resizeComponent(elementId, size, shouldScale) {
  var element = document.querySelector(getElementId(elementId));
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

export function loadOverlayComponent(url, instanceId) {
  document.body.insertAdjacentHTML('beforeend', component(url, instanceId));
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

export function hideOverlayComponent() {
  var message = document.querySelector("#gist-message");
  if (message) {
    message.classList.remove("visible");
    setTimeout(removeOverlayComponent, 300);
  } else {
    removeOverlayComponent();
  }
}

export function removeOverlayComponent() {
  var mainMessageElement = document.querySelector("#gist-embed-message");
  if (mainMessageElement) {
    mainMessageElement.parentNode.removeChild(mainMessageElement);
  }
}

function getElementId(elementId) {
  return `#${elementId}`;
}

function showMessage() {
  var message = document.querySelector("#gist-message");
  if (message) message.classList.add("visible");
}

function embed(url) {
  var template = require("html-loader!../templates/embed.html");
  template = template.replace("${url}", url);
  return template;
}

function component(url, instanceId) {
  var template = require("html-loader!../templates/message.html");
  template = template.replace("${url}", url);
  template = template.replace("${instanceId}", instanceId);
  return template;
}