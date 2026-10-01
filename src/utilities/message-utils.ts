import Gist from '../gist';
import { positions } from '../managers/page-component-manager';
import {
  resolveMessageProperties,
  MESSAGE_PROPERTY_DEFAULTS,
} from '../managers/gist-properties-manager';
import { log } from './log';
import type { GistMessage, DisplaySettings } from '../types';

export const wideOverlayPositions: readonly string[] = [
  'x-gist-top',
  'x-gist-bottom',
  'x-gist-floating-top',
  'x-gist-floating-bottom',
];

export function fetchMessageByInstanceId(instanceId: string): GistMessage | undefined {
  return Gist.currentMessages.find((message: GistMessage) => message.instanceId === instanceId);
}

export function isQueueIdAlreadyShowing(queueId: string | undefined): boolean {
  if (!queueId) {
    return false;
  }
  return Gist.currentMessages.some((message: GistMessage) => message.queueId === queueId);
}

export function fetchMessageByElementId(elementId: string | null | undefined): GistMessage | null {
  if (!elementId) {
    return null;
  }
  return (
    Gist.currentMessages.find((message: GistMessage) => message.elementId === elementId) ?? null
  );
}

export function removeMessageByInstanceId(instanceId: string): void {
  Gist.currentMessages = Gist.currentMessages.filter(
    (message: GistMessage) => message.instanceId !== instanceId
  );
}

export function updateMessageByInstanceId(instanceId: string, message: GistMessage): void {
  removeMessageByInstanceId(instanceId);
  Gist.currentMessages.push(message);
}

const OVERLAY_POSITION_TO_ELEMENT_ID: Record<string, string> = {
  topLeft: 'x-gist-floating-top-left',
  topCenter: 'x-gist-floating-top',
  topRight: 'x-gist-floating-top-right',
  bottomLeft: 'x-gist-floating-bottom-left',
  bottomCenter: 'x-gist-floating-bottom',
  bottomRight: 'x-gist-floating-bottom-right',
};

const ELEMENT_ID_TO_OVERLAY_POSITION: Record<string, string> = Object.fromEntries(
  Object.entries(OVERLAY_POSITION_TO_ELEMENT_ID).map(([key, value]) => [value, key])
);

export function mapOverlayPositionToElementId(overlayPosition: string | undefined): string {
  if (!overlayPosition || !OVERLAY_POSITION_TO_ELEMENT_ID[overlayPosition]) {
    log(`Invalid overlay position "${overlayPosition}", defaulting to "topCenter"`);
    return OVERLAY_POSITION_TO_ELEMENT_ID['topCenter'];
  }

  return OVERLAY_POSITION_TO_ELEMENT_ID[overlayPosition];
}

export function mapElementIdToOverlayPosition(
  elementId: string | undefined | null
): string | undefined {
  if (!elementId) return undefined;
  return ELEMENT_ID_TO_OVERLAY_POSITION[elementId];
}

export function matchesRouteRule(rule: string): boolean {
  try {
    const routeRule = new RegExp(rule);
    const pathname = new URL(window.location.href).pathname;
    const currentRoute = Gist.currentRoute;

    // Route rule evaluation checks two values.
    //
    // Gist.currentRoute (primary): Set by the SDK's analytics.page() call. This is
    // what customers have historically built their rules against. The value varies
    // by call style — analytics.page("Name") sets an arbitrary string like "Name",
    // analytics.page() sets the full URL, and never calling it leaves currentRoute
    // null. Existing customers have live rules that depend on all of these formats.
    //
    // pathname (fallback): The URL path from window.location. Always available and
    // always a path like "/dashboard", regardless of how analytics.page() was called.
    // Catches cases where currentRoute is null or set to a value that doesn't match.
    //
    // Hash routes are the exception. pathname drops the hash, so it passes an
    // exclusion aimed at a hash route like "/#deposit" and the message would show
    // on the very page the rule excludes (INAPP-14866). When page() passed the
    // hash route the visitor is on, and the exclusion matches that hash rather
    // than the rest of the route, the exclusion wins.
    if (currentRoute != null && isExcludedByCurrentHash(rule, currentRoute)) {
      return false;
    }

    const matchesCurrentRoute = currentRoute != null && routeRule.test(currentRoute);
    const matchesPathname = currentRoute !== pathname && routeRule.test(pathname);
    return matchesCurrentRoute || matchesPathname;
  } catch {
    return false;
  }
}

/**
 * Whether `route` is the hash route the visitor is on and a rule's exclusion
 * matches it only because of that hash. Moving to another hash without a new
 * page() call, or an exclusion that also matches the route minus its hash
 * (its host, path or query), leaves the rule to the plain evaluation.
 */
function isExcludedByCurrentHash(rule: string, route: string): boolean {
  const hashStart = route.indexOf('#');
  return (
    hashStart !== -1 &&
    route.slice(hashStart) === window.location.hash &&
    isExcludedByRouteRule(rule, route) &&
    !isExcludedByRouteRule(rule, route.slice(0, hashStart))
  );
}

/**
 * Whether `route` hits the exclusion half of a server-compiled route rule.
 * Exclude rules compile to ^(?!E).*$, or ^(?=I)(?!E).*$ alongside include
 * rules, with every rule value escaped — so an unescaped paren is always
 * structure. Any other rule (include-only, the do-not-display sentinel, a
 * hand-written regex) has no exclusion to isolate and returns false, leaving
 * the rule to the plain evaluation.
 */
function isExcludedByRouteRule(rule: string, route: string): boolean {
  try {
    let exclusionStart = 1;
    if (rule.startsWith('^(?=')) {
      const includeEnd = closingParenIndex(rule, 1);
      if (includeEnd === -1) {
        return false;
      }
      exclusionStart = includeEnd + 1;
    }

    const isExclusion =
      rule.startsWith('^') &&
      rule.startsWith('(?!', exclusionStart) &&
      rule.endsWith('.*$') &&
      closingParenIndex(rule, exclusionStart) === rule.length - 4;
    return isExclusion && !new RegExp(`^${rule.slice(exclusionStart)}`).test(route);
  } catch {
    return false;
  }
}

// Index of the paren closing the group opened at source[open], or -1.
function closingParenIndex(source: string, open: number): number {
  let depth = 0;
  let inCharClass = false;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      i++;
    } else if (inCharClass) {
      inCharClass = char !== ']';
    } else if (char === '[') {
      inCharClass = true;
    } else if (char === '(') {
      depth++;
    } else if (char === ')' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/**
 * Whether a step's page-url refers to the page the visitor is currently on.
 * Compared by pathname only: authored URLs stay environment-agnostic (staging
 * and production hosts differ) and query/hash noise is ignored. Relative URLs
 * resolve against the current location. Unparseable values fail open (treated
 * as matching) so a bad authored URL can't strand a tour mid-way.
 */
export function matchesPageUrl(pageUrl: string): boolean {
  try {
    const stepPath = new URL(pageUrl, window.location.href).pathname.replace(/\/+$/, '') || '/';
    const currentPath = new URL(window.location.href).pathname.replace(/\/+$/, '') || '/';
    return stepPath === currentPath;
  } catch {
    return true;
  }
}

export function getCurrentDisplayType(
  message: GistMessage
): 'modal' | 'overlay' | 'inline' | 'tooltip' {
  if (message.tooltipPosition) {
    return 'tooltip';
  }
  if (message.overlay) {
    return 'modal';
  } else if (message.elementId && positions.includes(message.elementId)) {
    return 'overlay';
  } else if (message.elementId) {
    return 'inline';
  }
  return 'modal';
}

export function hasDisplayChanged(
  currentMessage: GistMessage,
  displaySettings: DisplaySettings
): boolean {
  const currentDisplayType = getCurrentDisplayType(currentMessage);
  const newDisplayType = displaySettings.displayType;

  if (newDisplayType === undefined) {
    return false;
  }

  if (currentDisplayType !== newDisplayType) {
    return true;
  }

  const resolvedProps = resolveMessageProperties(currentMessage);

  switch (newDisplayType) {
    case 'modal': {
      const currentPosition = currentMessage.position || 'center';
      const newPosition = displaySettings.modalPosition || 'center';
      if (currentPosition !== newPosition) {
        return true;
      }

      // Compare effective values: undefined means "revert to default", so we always compare
      const newExitClick =
        displaySettings.dismissOutsideClick ?? MESSAGE_PROPERTY_DEFAULTS.exitClick;
      if (resolvedProps.exitClick !== newExitClick) {
        return true;
      }

      const newOverlayColor =
        displaySettings.overlayColor ?? MESSAGE_PROPERTY_DEFAULTS.overlayColor;
      if (resolvedProps.overlayColor !== newOverlayColor) {
        return true;
      }
      break;
    }
    case 'overlay': {
      const newElementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
      if (currentMessage.elementId !== newElementId) {
        return true;
      }
      break;
    }
    case 'inline': {
      if (currentMessage.elementId !== displaySettings.elementSelector) {
        return true;
      }
      break;
    }
    case 'tooltip': {
      if (currentMessage.tooltipPosition !== displaySettings.tooltipPosition) {
        return true;
      }
      if (currentMessage.elementId !== displaySettings.elementSelector) {
        return true;
      }
      if (
        displaySettings.tooltipArrowColor !== undefined &&
        resolvedProps.tooltipArrowColor !== displaySettings.tooltipArrowColor
      ) {
        return true;
      }
      break;
    }
  }

  const isWideOverlay =
    newDisplayType === 'overlay' &&
    wideOverlayPositions.includes(mapOverlayPositionToElementId(displaySettings.overlayPosition));

  if (!isWideOverlay) {
    const newMaxWidth = displaySettings.maxWidth ?? MESSAGE_PROPERTY_DEFAULTS.messageWidth;
    if (resolvedProps.messageWidth !== newMaxWidth) {
      return true;
    }
  }

  return false;
}

export function applyDisplaySettings(message: GistMessage, displaySettings: DisplaySettings): void {
  if (!message.properties) {
    message.properties = {};
  }
  if (!message.properties.gist) {
    message.properties.gist = {};
  }

  if (displaySettings.displayType === 'modal') {
    message.overlay = true;
    message.elementId = null;
    message.properties.gist.elementId = null;
    message.position = displaySettings.modalPosition || 'center';
    message.properties.gist.position = displaySettings.modalPosition || 'center';
    message.tooltipPosition = undefined;
    message.properties.gist.tooltipPosition = undefined;
    message.properties.gist.tooltipArrowColor = undefined;
  } else if (displaySettings.displayType === 'overlay') {
    message.overlay = false;
    const elementId = mapOverlayPositionToElementId(displaySettings.overlayPosition);
    message.elementId = elementId;
    message.properties.gist.elementId = elementId;
    message.position = null;
    message.properties.gist.position = null;
    message.tooltipPosition = undefined;
    message.properties.gist.tooltipPosition = undefined;
    message.properties.gist.tooltipArrowColor = undefined;
  } else if (displaySettings.displayType === 'inline') {
    message.overlay = false;
    message.elementId = displaySettings.elementSelector;
    message.properties.gist.elementId = displaySettings.elementSelector;
    message.position = null;
    message.properties.gist.position = null;
    message.tooltipPosition = undefined;
    message.properties.gist.tooltipPosition = undefined;
    message.properties.gist.tooltipArrowColor = undefined;
  } else if (displaySettings.displayType === 'tooltip') {
    message.overlay = false;
    message.elementId = displaySettings.elementSelector;
    message.properties.gist.elementId = displaySettings.elementSelector;
    message.tooltipPosition = displaySettings.tooltipPosition;
    message.properties.gist.tooltipPosition = displaySettings.tooltipPosition;
    message.position = null;
    message.properties.gist.position = null;
    if (displaySettings.tooltipArrowColor !== undefined) {
      message.properties.gist.tooltipArrowColor = displaySettings.tooltipArrowColor;
    }
  }

  const isWideOverlayPosition =
    message.elementId && wideOverlayPositions.includes(message.elementId);

  if (isWideOverlayPosition) {
    delete message.properties.gist.messageWidth;
  } else if (displaySettings.maxWidth !== undefined && displaySettings.maxWidth > 0) {
    message.properties.gist.messageWidth = displaySettings.maxWidth;
  } else {
    delete message.properties.gist.messageWidth;
  }

  if (displaySettings.overlayColor !== undefined) {
    message.properties.gist.overlayColor = displaySettings.overlayColor;
  } else {
    delete message.properties.gist.overlayColor;
  }

  if (displaySettings.dismissOutsideClick !== undefined) {
    message.properties.gist.exitClick = displaySettings.dismissOutsideClick;
  } else {
    delete message.properties.gist.exitClick;
  }
}
