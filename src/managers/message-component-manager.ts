import Gist from '../gist';
import { log } from '../utilities/log';
import { resolveMessageProperties } from './gist-properties-manager';
import { embedHTMLTemplate } from '../templates/embed';
import { messageHTMLTemplate } from '../templates/message';
import { tooltipHTMLTemplate } from '../templates/tooltip';
import { positions } from './page-component-manager';
import { wideOverlayPositions } from '../utilities/message-utils';
import {
  positionTooltip,
  type TooltipPosition,
  type TooltipHandle,
} from './tooltip-position-manager';
import type { GistMessage, ResolvedMessageProperties } from '../types';

interface MessageOptions {
  endpoint: string;
  siteId: string;
  dataCenter?: string;
  messageId: string;
  instanceId: string;
  livePreview: boolean;
  properties?: unknown;
  customAttributes?: Record<string, unknown>;
  stepId?: string;
  [key: string]: unknown;
}

const delay = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

export function loadEmbedComponent(
  elementId: string,
  url: string,
  message: GistMessage,
  options: MessageOptions,
  stepName: string | null = null
): void {
  const element = safelyFetchElement(elementId);
  if (element) {
    const messageElementId = getMessageElementId(message.instanceId ?? '');
    element.classList.add(messageElementId);
    const messageProperties = resolveMessageProperties(message);
    let messageWidth = messageProperties.messageWidth + 'px';
    if (wideOverlayPositions.includes(elementId) && !messageProperties.hasCustomWidth) {
      messageWidth = '100%';
    }
    if (positions.includes(elementId)) {
      element.style.width = messageWidth;
    }
    if (!elementHasHeight(elementId)) {
      element.style.height = '0px';
    }
    element.innerHTML = embed(url, message, messageProperties);
    attachIframeLoadEvent(messageElementId, options, stepName);
  } else {
    log(`Message could not be embedded, elementId ${elementId} not found.`);
  }
}

export function showEmbedComponent(elementId: string): void {
  const element = safelyFetchElement(elementId);
  if (element) {
    element.classList.add('gist-visible');
  }
}

export function hideEmbedComponent(elementId: string): void {
  const element = safelyFetchElement(elementId);
  if (element) {
    element.classList.remove('gist-visible');
    const classesToRemove = Array.from(element.classList).filter((cls) => cls.startsWith('gist-'));
    classesToRemove.forEach((cls) => element.classList.remove(cls));
    element.style.removeProperty('height');
    element.style.removeProperty('width');
    element.innerHTML = '';
  }
}

export function elementHasHeight(elementId: string): boolean | undefined {
  const element = safelyFetchElement(elementId);
  if (element) {
    return !!(element.style && element.style.height && element.style.height !== '0px');
  }
}

export function resizeComponent(
  message: GistMessage,
  size: { width: number; height: number }
): void {
  const elementId = message.elementId
    ? message.elementId
    : getMessageElementId(message.instanceId ?? '');
  const element = safelyFetchElement(elementId);
  if (element) {
    const style = element.style;
    if (size.height > 0) {
      if (size.height > window.innerHeight) {
        const heightScale = 1 - (size.height / window.innerHeight - 1);
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

export function loadOverlayComponent(
  url: string,
  message: GistMessage,
  options: MessageOptions,
  stepName: string | null = null
): void {
  document.querySelectorAll('#gist-embed-message').forEach((el) => {
    el.parentNode?.removeChild(el);
  });
  document.body.insertAdjacentHTML('afterbegin', component(url, message));
  attachIframeLoadEvent(getMessageElementId(message.instanceId ?? ''), options, stepName);
}

function attachIframeLoadEvent(
  elementId: string,
  options: MessageOptions,
  stepName: string | null = null
): void {
  const iframe = document.getElementById(elementId) as HTMLIFrameElement | null;
  if (iframe) {
    iframe.onload = () => {
      sendOptionsToIframe(elementId, options, stepName);
    };
  }
}

const SDK_CAPABILITIES = ['MultiStepDisplayTypes'] as const;

export function sendOptionsToIframe(
  iframeId: string,
  options: MessageOptions,
  stepName: string | null = null
): void {
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe?.contentWindow) {
    const message = {
      options,
      capabilities: SDK_CAPABILITIES,
    };
    if (stepName) {
      options.stepId = stepName;
    }
    iframe.contentWindow.postMessage(message, '*');
  }
}

export function sendDisplaySettingsToIframe(message: GistMessage): void {
  if (!message.displaySettings) {
    return;
  }

  const iframeId = getMessageElementId(message.instanceId ?? '');
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(
      {
        action: 'updateDisplaySettings',
        displaySettings: message.displaySettings,
      },
      '*'
    );
  }
}

export function showOverlayComponent(message: GistMessage): void {
  const messageProperties = resolveMessageProperties(message);
  const mainMessageElement = document.querySelector('#gist-overlay');
  if (mainMessageElement) {
    mainMessageElement.classList.add('gist-visible');
    const messageElement = document.querySelector('.gist-message');
    if (messageElement) {
      if (message.position) {
        messageElement.classList.add('gist-' + message.position);
      } else {
        messageElement.classList.add('gist-center');
      }
    }
    setTimeout(showMessage, 100);
    if (messageProperties.exitClick) {
      setTimeout(() => addDismissListener(message.instanceId ?? ''), 1000);
    }
  } else {
    removeOverlayComponent();
  }
}

function addDismissListener(instanceId: string): void {
  const mainMessageElement = document.querySelector('#gist-overlay');
  if (mainMessageElement) {
    mainMessageElement.addEventListener('click', () => {
      Gist.dismissMessage(instanceId);
    });
  }
}

export async function hideOverlayComponent(): Promise<void> {
  const message = document.querySelector('.gist-message');
  if (message) {
    message.classList.remove('gist-visible');
    await delay(300);
  }
  removeOverlayComponent();
}

export function removeOverlayComponent(): void {
  const mainMessageElement = document.querySelector('#gist-embed-message');
  if (mainMessageElement) {
    mainMessageElement.parentNode?.removeChild(mainMessageElement);
  }
}

const tooltipHandleMap = new Map<string, TooltipHandle>();

export function loadTooltipComponent(
  url: string,
  message: GistMessage,
  options: MessageOptions,
  stepName: string | null = null
): void {
  const instanceId = message.instanceId ?? '';
  const messageElementId = getMessageElementId(instanceId);
  const messageProperties = resolveMessageProperties(message);

  const existingHandle = tooltipHandleMap.get(instanceId);
  if (existingHandle) {
    existingHandle.cleanup();
    tooltipHandleMap.delete(instanceId);
  }

  document.querySelectorAll(`#gist-tooltip-${instanceId}`).forEach((el) => {
    el.parentNode?.removeChild(el);
  });

  const wrapper = document.createElement('div');
  wrapper.id = `gist-tooltip-${instanceId}`;
  wrapper.innerHTML = tooltipHTMLTemplate(messageElementId, messageProperties, url);
  document.body.appendChild(wrapper);

  attachIframeLoadEvent(messageElementId, options, stepName);
}

export function showTooltipComponent(message: GistMessage): void {
  const instanceId = message.instanceId ?? '';
  const messageProperties = resolveMessageProperties(message);
  const wrapperId = `gist-tooltip-${instanceId}`;
  const wrapper = safelyFetchElement(wrapperId);
  if (!wrapper) {
    log(`Tooltip wrapper not found for instance ${instanceId}`);
    return;
  }

  const selector =
    (message.properties?.gist?.elementId as string | undefined) || message.elementId || undefined;
  if (!selector) {
    log(`No target selector for tooltip ${instanceId}`);
    return;
  }

  const existingHandle = tooltipHandleMap.get(instanceId);
  if (existingHandle) {
    existingHandle.cleanup();
    tooltipHandleMap.delete(instanceId);
  }

  const tooltipElement = wrapper.querySelector('#gist-tooltip') as HTMLElement | null;
  if (!tooltipElement) {
    log(`Tooltip inner element not found for instance ${instanceId}`);
    return;
  }

  const position = (messageProperties.tooltipPosition || 'bottom') as TooltipPosition;
  const handle = positionTooltip(tooltipElement, selector, position);
  if (handle) {
    tooltipHandleMap.set(instanceId, handle);

    const container = wrapper.querySelector('#gist-tooltip-container') as HTMLElement | null;
    if (container) {
      container.classList.add('gist-visible');
    }
  } else {
    log(`Failed to position tooltip for instance ${instanceId}, target may not exist`);
  }
}

export function hideTooltipComponent(message: GistMessage): void {
  const instanceId = message.instanceId ?? '';

  const existingHandle = tooltipHandleMap.get(instanceId);
  if (existingHandle) {
    existingHandle.cleanup();
    tooltipHandleMap.delete(instanceId);
  }

  const wrapperId = `gist-tooltip-${instanceId}`;
  const wrapper = safelyFetchElement(wrapperId);
  if (wrapper) {
    wrapper.parentNode?.removeChild(wrapper);
  }
}

export function resizeTooltipComponent(
  message: GistMessage,
  size: { width: number; height: number }
): void {
  const instanceId = message.instanceId ?? '';
  const iframeId = getMessageElementId(instanceId);
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe && size.height > 0) {
    iframe.style.height = `${size.height}px`;

    const handle = tooltipHandleMap.get(instanceId);
    if (handle) {
      handle.reposition();
    }
  }
}

export function changeOverlayTitle(instanceId: string, title: string): void {
  const element = safelyFetchElement(getMessageElementId(instanceId));
  if (element) {
    element.title = title;
  }
}

function getMessageElementId(instanceId: string): string {
  return `gist-${instanceId}`;
}

function showMessage(): void {
  const messageElement = document.querySelector('.gist-message');
  if (messageElement) messageElement.classList.add('gist-visible');
}

function embed(
  url: string,
  message: GistMessage,
  messageProperties: ResolvedMessageProperties
): string {
  return embedHTMLTemplate(getMessageElementId(message.instanceId ?? ''), messageProperties, url);
}

function component(url: string, message: GistMessage): string {
  const messageProperties = resolveMessageProperties(message);
  return messageHTMLTemplate(getMessageElementId(message.instanceId ?? ''), messageProperties, url);
}

function safelyFetchElement(elementId: string): HTMLElement | null {
  try {
    const element = document.getElementById(elementId) ?? document.querySelector(elementId);
    return (element as HTMLElement) || null;
  } catch {
    return null;
  }
}
