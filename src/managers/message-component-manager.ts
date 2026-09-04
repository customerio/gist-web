import Gist from '../gist';
import { log } from '../utilities/log';
import { findElement } from '../utilities/dom';
import { resolveMessageProperties } from './gist-properties-manager';
import { embedHTMLTemplate } from '../templates/embed';
import { messageHTMLTemplate } from '../templates/message';
import { tooltipHTMLTemplate } from '../templates/tooltip';
import { positions } from './page-component-manager';
import { wideOverlayPositions } from '../utilities/message-utils';
import {
  positionTooltip,
  ensureTargetInView,
  type TooltipPosition,
  type TooltipHandle,
} from './tooltip-position-manager';
import type { GistMessage, ResolvedMessageProperties, ColorScheme } from '../types';

function readParentColorScheme(): string | undefined {
  const htmlScheme = getComputedStyle(document.documentElement).colorScheme;
  if (htmlScheme && htmlScheme !== 'normal') return htmlScheme;
  if (document.body) {
    const bodyScheme = getComputedStyle(document.body).colorScheme;
    if (bodyScheme && bodyScheme !== 'normal') return bodyScheme;
  }
  return undefined;
}

function parseSingleScheme(value: string): 'light' | 'dark' | undefined {
  const hasDark = value.includes('dark');
  const hasLight = value.includes('light');
  if (hasDark && hasLight) return undefined;
  if (hasDark) return 'dark';
  if (hasLight) return 'light';
  return undefined;
}

function resolveColorSchemeCss(colorScheme: ColorScheme | undefined): string {
  if (colorScheme === 'system' || colorScheme === 'auto') return 'normal';
  return 'light only';
}

export function resolveRendererColorScheme(
  colorScheme: ColorScheme | undefined
): 'light' | 'dark' | undefined {
  if (!colorScheme || colorScheme === 'default') return 'light';
  if (colorScheme === 'system') return undefined;
  const raw = readParentColorScheme();
  return raw ? parseSingleScheme(raw) : undefined;
}

let colorSchemeObserver: MutationObserver | null = null;
let lastRendererColorScheme: 'light' | 'dark' | undefined;

function stopColorSchemeObserver(): void {
  if (colorSchemeObserver) {
    colorSchemeObserver.disconnect();
    colorSchemeObserver = null;
  }
}

export function applyColorSchemeChange(): void {
  const colorScheme = Gist.config?.colorScheme;

  if (colorScheme === 'auto') {
    startColorSchemeObserver();
  } else {
    stopColorSchemeObserver();
  }

  const rendererScheme = resolveRendererColorScheme(colorScheme);
  lastRendererColorScheme = rendererScheme;
  updateColorSchemeOnLiveIframes(rendererScheme);
}

export function startColorSchemeObserver(): void {
  if (colorSchemeObserver) return;

  lastRendererColorScheme = resolveRendererColorScheme(Gist.config?.colorScheme);

  const check = () => {
    const current = resolveRendererColorScheme(Gist.config?.colorScheme);
    if (current !== lastRendererColorScheme) {
      lastRendererColorScheme = current;
      updateColorSchemeOnLiveIframes(current);
    }
  };

  colorSchemeObserver = new MutationObserver(check);
  colorSchemeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
  if (document.body) {
    colorSchemeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }
}

function updateColorSchemeOnLiveIframes(scheme: 'light' | 'dark' | undefined): void {
  const value = scheme ?? 'normal';
  const cssProp = resolveColorSchemeCss(Gist.config?.colorScheme);
  for (const msg of Gist.currentMessages ?? []) {
    const iframeId = getMessageElementId(msg.instanceId ?? '');
    const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
    if (iframe) {
      iframe.style.colorScheme = cssProp;
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ action: 'updateColorScheme', colorScheme: value }, '*');
      }
    }
  }
  Gist.events?.dispatch('colorSchemeChanged', scheme);
}

interface MessageOptions {
  endpoint: string;
  siteId: string;
  dataCenter?: string;
  messageId: string;
  instanceId: string;
  livePreview: boolean;
  isEmbed?: boolean;
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
  const element = findElement(elementId);
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
  const element = findElement(elementId);
  if (element) {
    element.classList.add('gist-visible');
  }
}

export function hideEmbedComponent(elementId: string): void {
  const element = findElement(elementId);
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
  const element = findElement(elementId);
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
  const element = findElement(elementId);
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
  removeEscapeKeyListener();
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

const SDK_CAPABILITIES = ['MultiStepDisplayTypes', 'CrossPageStepNavigation', 'Snooze'] as const;

// An embed lives inside an element the host page owns: it must never ask the
// SDK to re-render a step as a modal or tooltip, and it must never navigate the
// host page away for a cross-page step. Withholding both capabilities makes the
// renderer keep every step change a local toggle inside its own iframe.
const EMBED_SDK_CAPABILITIES = ['Snooze'] as const;

function capabilitiesFor(options: MessageOptions): readonly string[] {
  return options.isEmbed ? EMBED_SDK_CAPABILITIES : SDK_CAPABILITIES;
}

export function sendOptionsToIframe(
  iframeId: string,
  options: MessageOptions,
  stepName: string | null = null
): void {
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe?.contentWindow) {
    if (stepName) {
      options.stepId = stepName;
    }
    const rendererScheme = resolveRendererColorScheme(Gist.config?.colorScheme);
    if (rendererScheme) {
      options.colorScheme = rendererScheme;
    }
    const message = {
      options,
      capabilities: capabilitiesFor(options),
    };
    iframe.contentWindow.postMessage(message, '*');
  }
}

/**
 * Answers a stepChangeRequested bridge event with "stay on this page": the
 * renderer withheld its local toggle pending our decision, so instruct it to
 * show the step now (INAPP-14575).
 */
export function sendShowStepToIframe(
  message: GistMessage,
  stepName: string,
  requestId?: number
): void {
  const iframeId = getMessageElementId(message.instanceId ?? '');
  const iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  // requestId echoes the stepChangeRequested event being answered; the
  // renderer only applies the reply to its outstanding request, so a stale
  // reply can't override a newer toggle (INAPP-14575).
  iframe?.contentWindow?.postMessage({ action: 'showStep', stepId: stepName, requestId }, '*');
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
      addEscapeKeyListener(message.instanceId ?? '');
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

let escapeKeyListener: ((event: KeyboardEvent) => void) | null = null;

function addEscapeKeyListener(instanceId: string): void {
  removeEscapeKeyListener();
  escapeKeyListener = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      Gist.dismissMessage(instanceId);
    }
  };
  document.addEventListener('keydown', escapeKeyListener);
}

function removeEscapeKeyListener(): void {
  if (escapeKeyListener) {
    document.removeEventListener('keydown', escapeKeyListener);
    escapeKeyListener = null;
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
  removeEscapeKeyListener();
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

  const wrapperId = `gist-tooltip-${instanceId}`;
  const wrapper = document.createElement('div');
  wrapper.id = wrapperId;
  const colorSchemeCss = resolveColorSchemeCss(Gist.config?.colorScheme);
  wrapper.innerHTML = tooltipHTMLTemplate(
    messageElementId,
    messageProperties,
    url,
    wrapperId,
    colorSchemeCss
  );
  document.body.appendChild(wrapper);

  attachIframeLoadEvent(messageElementId, options, stepName);
}

export async function showTooltipComponent(message: GistMessage): Promise<boolean> {
  const instanceId = message.instanceId ?? '';
  const messageProperties = resolveMessageProperties(message);
  const wrapperId = `gist-tooltip-${instanceId}`;
  const wrapper = findElement(wrapperId);
  if (!wrapper) {
    log(`Tooltip wrapper not found for instance ${instanceId}`);
    return false;
  }

  const selector =
    (message.properties?.gist?.elementId as string | undefined) || message.elementId || undefined;
  if (!selector) {
    log(`No target selector for tooltip ${instanceId}`);
    return false;
  }

  const existingHandle = tooltipHandleMap.get(instanceId);
  if (existingHandle) {
    existingHandle.cleanup();
    tooltipHandleMap.delete(instanceId);
  }

  const tooltipElement = wrapper.querySelector('.gist-tooltip-outer') as HTMLElement | null;
  if (!tooltipElement) {
    log(`Tooltip inner element not found for instance ${instanceId}`);
    return false;
  }

  const position = (messageProperties.tooltipPosition || 'bottom') as TooltipPosition;

  const targetReady = await ensureTargetInView(tooltipElement, selector, position);
  if (!targetReady) {
    log(
      `Tooltip for instance ${instanceId} skipped: target "${selector}" is off-screen and cannot be scrolled into a valid position`
    );
    return false;
  }

  const handle = positionTooltip(tooltipElement, selector, position, {
    onDetach: () => {
      tooltipHandleMap.delete(instanceId);
      const w = findElement(wrapperId);
      if (w) {
        w.parentNode?.removeChild(w);
      }
    },
  });

  if (handle) {
    const isVisible = tooltipElement.style.display !== 'none';
    if (isVisible) {
      const container = wrapper.querySelector('.gist-tooltip-container') as HTMLElement | null;
      if (!container) {
        handle.cleanup();
        log(`Tooltip container not found for instance ${instanceId}`);
        return false;
      }
      tooltipHandleMap.set(instanceId, handle);
      container.classList.add('gist-visible');
      return true;
    }
    handle.cleanup();
    log(
      `Tooltip for instance ${instanceId} could not be positioned within the viewport, target "${selector}" may be off-screen`
    );
    return false;
  }
  log(
    `Failed to position tooltip for instance ${instanceId}, target "${selector}" may not exist or no position fits the viewport`
  );
  return false;
}

export function hideTooltipComponent(message: GistMessage): void {
  const instanceId = message.instanceId ?? '';

  const existingHandle = tooltipHandleMap.get(instanceId);
  if (existingHandle) {
    existingHandle.cleanup();
    tooltipHandleMap.delete(instanceId);
  }

  const wrapperId = `gist-tooltip-${instanceId}`;
  const wrapper = findElement(wrapperId);
  if (wrapper) {
    wrapper.parentNode?.removeChild(wrapper);
  }
}

export function clearAllTooltipHandles(): void {
  tooltipHandleMap.forEach((handle) => handle.cleanup());
  tooltipHandleMap.clear();

  document.querySelectorAll('[id^="gist-tooltip-"]').forEach((el) => {
    el.parentNode?.removeChild(el);
  });
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
  const element = findElement(getMessageElementId(instanceId));
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
  const colorSchemeCss = resolveColorSchemeCss(Gist.config?.colorScheme);
  return embedHTMLTemplate(
    getMessageElementId(message.instanceId ?? ''),
    messageProperties,
    url,
    colorSchemeCss
  );
}

function component(url: string, message: GistMessage): string {
  const messageProperties = resolveMessageProperties(message);
  const colorSchemeCss = resolveColorSchemeCss(Gist.config?.colorScheme);
  return messageHTMLTemplate(
    getMessageElementId(message.instanceId ?? ''),
    messageProperties,
    url,
    colorSchemeCss
  );
}
