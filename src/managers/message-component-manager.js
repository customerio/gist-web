import Gist from '../gist';
import { log } from "../utilities/log";
import { resolveMessageProperties } from "./gist-properties-manager";
import { embedHTMLTemplate } from "../templates/embed";
import { messageHTMLTemplate } from "../templates/message";
import { positions } from "./page-component-manager";
import { wideOverlayPositions } from "../utilities/message-utils";

const delay = ms => new Promise(res => setTimeout(res, ms));

export function loadEmbedComponent(elementId, url, message, options, stepName = null) {
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
    attachIframeLoadEvent(messageElementId, options, stepName);
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
    // Remove all gist-* classes (instanceId classes)
    const classesToRemove = Array.from(element.classList).filter(cls => cls.startsWith('gist-'));
    classesToRemove.forEach(cls => element.classList.remove(cls));
    element.style.removeProperty("height");
    element.style.removeProperty("width");
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

export function loadOverlayComponent(url, message, options, stepName = null) {
  document.querySelectorAll('#gist-embed-message').forEach(function(el) {
    el.parentNode.removeChild(el);
  });
  document.body.insertAdjacentHTML('afterbegin', component(url, message));
  attachIframeLoadEvent(getMessageElementId(message.instanceId), options, stepName);
}

function attachIframeLoadEvent(elementId, options, stepName = null) {
  const iframe = document.getElementById(elementId);
  if (iframe) {
      iframe.onload = function() {
          sendOptionsToIframe(elementId, options, stepName); // Send the options when iframe loads
      };
  }
}

// SDK capabilities that can be communicated to the renderer
const SDK_CAPABILITIES = [
  'MultiStepDisplayTypes'
];

export function sendOptionsToIframe(iframeId, options, stepName = null) {
  const iframe = document.getElementById(iframeId);
  if (iframe && iframe.contentWindow) {
    const message = { 
      options: options,
      capabilities: SDK_CAPABILITIES
    };
    if (stepName) {
      options.stepId = stepName;
    }
    iframe.contentWindow.postMessage(message, '*');
  }
}

export function sendDisplaySettingsToIframe(message) {
  // Only send if displaySettings exist
  if (!message.displaySettings) {
    return;
  }
  
  const iframeId = getMessageElementId(message.instanceId);
  const iframe = document.getElementById(iframeId);
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      action: 'updateDisplaySettings',
      displaySettings: message.displaySettings
    }, '*');
  }
}

export function showOverlayComponent(message) {
  var messageProperties = resolveMessageProperties(message);
  var mainMessageElement = document.querySelector("#gist-overlay");
  if (mainMessageElement) {
    mainMessageElement.classList.add("gist-visible");
    var messageElement = document.querySelector(".gist-message");
    if (message.position) {
      messageElement.classList.add("gist-" + message.position);
    } else {
      messageElement.classList.add("gist-center");
    }
    setTimeout(showMessage, 100);
    // If exitClick is set to true, we add a dismiss listener after a 1-second delay to prevent accidental dismissals.
    if (messageProperties.exitClick) { setTimeout(() => addDismissListener(message.instanceId), 1000); }
  } else {
    removeOverlayComponent();
  }
}

function addDismissListener(instanceId) {
  // We check if the overlay is still active before adding the dismiss listener
  var mainMessageElement = document.querySelector("#gist-overlay");
  if (mainMessageElement) {
    mainMessageElement.addEventListener("click", function() {
      Gist.dismissMessage(instanceId);
    });
  }
}

export async function hideOverlayComponent() {
  var message = document.querySelector(".gist-message");
  if (message) {
    message.classList.remove("gist-visible");
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
  if (messageElement) messageElement.classList.add("gist-visible");
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