import { log } from '../utilities/log';
import { findElement, waitForElement } from '../utilities/dom';
import { embedMessage } from './message-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import {
  setKeyToLocalStore,
  getKeyFromLocalStore,
  clearKeyFromLocalStore,
  setKeyToSessionStore,
  getKeyFromSessionStore,
  clearKeyFromSessionStore,
} from '../utilities/local-storage';
import type { EmbedPayload, GistMessage, ResolvedMessageProperties } from '../types';

const embedStoreName = 'gist.web.embed';

/** Attribute naming the container an embed renders into. */
export const EMBED_TARGET_ATTRIBUTE = 'data-cio-embed';
/** Attribute naming the JSON payload block for an embed. */
export const EMBED_PAYLOAD_ATTRIBUTE = 'data-cio-embed-payload';

const EMBED_PAYLOAD_SELECTOR = `script[type="application/json"][${EMBED_PAYLOAD_ATTRIBUTE}]`;

// The container is usually in the DOM before the SDK runs, but a snippet placed
// above its own markup, or a page that renders the container client-side, needs
// a grace period before we give up on it.
const TARGET_WAIT_MS = 10000;

// Frequency keys are scoped to the embed, never to the user: every other local
// store in the SDK derives its key from getHashedUserToken(), which is null on
// a page with no identified or guest user — exactly the page an embed runs on.
function hiddenKey(embedId: string): string {
  return `${embedStoreName}.${embedId}.hidden`;
}

function shownKey(embedId: string): string {
  return `${embedStoreName}.${embedId}.shown`;
}

function sessionShownKey(embedId: string): string {
  return `${embedStoreName}.${embedId}.sessionShown`;
}

// Embeds currently occupying their container. Guards a loader that runs twice, a
// framework that re-mounts, and two concurrent renders of the same payload. A
// claim is released once the message is torn down (releaseEmbedClaim), so an
// embed whose container a route change replaced can be mounted again.
const renderedEmbeds = new Set<string>();

// Embeds the visitor closed during this page load. Held in memory rather than
// in the store so an "always" embed still stays closed once dismissed without
// persisting anything about the visitor; a genuine page load clears it.
const dismissedEmbeds = new Set<string>();

/**
 * Whether the embed's frequency rule allows it to render now. Any storage
 * failure resolves to "render": an embed is page content, and losing frequency
 * capping is a smaller failure than leaving a hole in the customer's layout.
 */
export function shouldRenderEmbed(embedId: string, properties: ResolvedMessageProperties): boolean {
  // A close always wins for the rest of the page load, whatever the rule says
  // about the next one — re-mounting must not reopen what the visitor shut.
  if (dismissedEmbeds.has(embedId)) {
    return false;
  }

  switch (properties.embedFrequency) {
    case 'untilDismissed':
      return getKeyFromLocalStore(hiddenKey(embedId)) === null;
    case 'onceEver':
      return getKeyFromLocalStore(shownKey(embedId)) === null;
    case 'oncePerSession':
      return getKeyFromSessionStore(sessionShownKey(embedId)) === null;
    case 'always':
    default:
      // Deliberately touches no storage, so an "always" embed needs no consent
      // disclosure on the host page.
      return true;
  }
}

export function recordEmbedShown(message: GistMessage): void {
  const embedId = message.embedId;
  if (!embedId) return;

  const properties = resolveMessageProperties(message);
  if (properties.embedFrequency === 'onceEver') {
    setKeyToLocalStore(shownKey(embedId), true);
    log(`Embed ${embedId} recorded as shown.`);
  } else if (properties.embedFrequency === 'oncePerSession') {
    setKeyToSessionStore(sessionShownKey(embedId), 'true');
    log(`Embed ${embedId} recorded as shown for this session.`);
  }
}

/**
 * Records a close. `hideForMinutes` comes from a gist://snooze action and hides
 * the embed for that long whatever its frequency rule; without it, only an
 * `untilDismissed` embed persists the close — every other mode is expected back
 * on the next page load.
 */
export function recordEmbedHidden(message: GistMessage, hideForMinutes?: number): void {
  const embedId = message.embedId;
  if (!embedId) return;

  dismissedEmbeds.add(embedId);

  const properties = resolveMessageProperties(message);
  const snoozed = hideForMinutes !== undefined && hideForMinutes > 0;
  if (!snoozed && properties.embedFrequency !== 'untilDismissed') return;

  const minutes = snoozed ? hideForMinutes : properties.embedReshowAfterMinutes;
  // No minutes means "permanently": setKeyToLocalStore's default expiry is the
  // longest the store supports, and a lapsed key simply makes the embed
  // eligible again.
  const expiry = minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000) : null;
  setKeyToLocalStore(hiddenKey(embedId), true, expiry);
  log(
    minutes > 0
      ? `Embed ${embedId} hidden for ${minutes} minute(s).`
      : `Embed ${embedId} hidden until its state is cleared.`
  );
}

/** Forgets an embed's frequency state. For QA and for host-app "show me again" affordances. */
export function clearEmbedState(embedId: string): void {
  clearKeyFromLocalStore(hiddenKey(embedId));
  clearKeyFromLocalStore(shownKey(embedId));
  clearKeyFromSessionStore(sessionShownKey(embedId));
  renderedEmbeds.delete(embedId);
  dismissedEmbeds.delete(embedId);
  log(`Embed ${embedId} state cleared.`);
}

/**
 * Releases an embed's container claim once its message has been torn down, so a
 * host that re-mounts after replacing the markup (an SPA route change, say) can
 * render it again. Whether it *should* render is still the frequency rule's
 * call — a dismissal outlives the claim.
 */
export function releaseEmbedClaim(message: GistMessage): void {
  if (message.embedId) {
    renderedEmbeds.delete(message.embedId);
  }
}

function defaultTargetFor(embedId: string): string {
  return `[${EMBED_TARGET_ATTRIBUTE}="${embedId}"]`;
}

function isTargetOccupied(selector: string): boolean {
  const element = findElement(selector);
  return !!element?.querySelector('.gist-frame');
}

/**
 * Renders a message the host handed us directly, into an element on the page.
 * Returns the instance id, or null when the embed was suppressed, malformed, or
 * had nowhere to render.
 */
export async function renderEmbed(payload: EmbedPayload): Promise<string | null> {
  const embedId = payload?.embedId;
  const message = payload?.message;

  if (!embedId || !message?.messageId) {
    log('Embed payload is missing an embedId or message, skipping.');
    return null;
  }
  if (!message.properties?.gist?.encodedMessageHtml) {
    log(`Embed ${embedId} payload has no message html, skipping.`);
    return null;
  }
  if (renderedEmbeds.has(embedId)) {
    log(`Embed ${embedId} has already been rendered on this page.`);
    return null;
  }

  message.embedId = embedId;
  if (payload.display) {
    message.properties.gist.embed = { ...payload.display, ...message.properties.gist.embed };
  }

  const properties = resolveMessageProperties(message);
  if (!shouldRenderEmbed(embedId, properties)) {
    log(`Embed ${embedId} suppressed by its "${properties.embedFrequency}" frequency rule.`);
    return null;
  }

  const target = payload.target || defaultTargetFor(embedId);

  // Claimed before the await so two concurrent renders of the same embed can't
  // both get past the check above.
  renderedEmbeds.add(embedId);
  let rendered = false;
  try {
    const element = await waitForElement(target, TARGET_WAIT_MS);
    if (!element) {
      log(`Embed ${embedId} target "${target}" never appeared, skipping.`);
      return null;
    }
    if (isTargetOccupied(target)) {
      log(`Embed ${embedId} target "${target}" already holds a message, skipping.`);
      return null;
    }

    const embedded = embedMessage(message, target);
    if (!embedded) {
      return null;
    }
    rendered = true;
    return embedded.instanceId ?? null;
  } catch (error) {
    log(`Embed ${embedId} failed to render: ${error}`);
    return null;
  } finally {
    // Only an accepted render keeps its claim; everything else stays retryable.
    if (!rendered) {
      renderedEmbeds.delete(embedId);
    }
  }
}

function parseEmbedPayload(script: Element): EmbedPayload | null {
  const embedId = script.getAttribute(EMBED_PAYLOAD_ATTRIBUTE) ?? '';
  try {
    const payload = JSON.parse(script.textContent ?? '') as EmbedPayload;
    // The attribute is the addressable id: it ties the block to its container
    // and stays readable when the payload itself is malformed.
    if (embedId && !payload.embedId) {
      payload.embedId = embedId;
    }
    return payload;
  } catch (error) {
    log(`Embed payload ${embedId || '(unnamed)'} could not be parsed: ${error}`);
    return null;
  }
}

/**
 * Renders every embed payload declared on the page. Safe to call repeatedly —
 * already-rendered embeds are skipped — so a host can call it again after
 * injecting new markup.
 */
export async function mountEmbedsFromDom(): Promise<string[]> {
  const scripts = Array.from(document.querySelectorAll(EMBED_PAYLOAD_SELECTOR));
  if (scripts.length === 0) {
    return [];
  }

  log(`Found ${scripts.length} embed payload(s) on the page.`);
  const payloads = scripts
    .map(parseEmbedPayload)
    .filter((payload): payload is EmbedPayload => payload !== null);

  // Rendered concurrently: each embed waits for its own container to appear, so
  // one container that never arrives would otherwise hold up every embed behind
  // it for the whole timeout.
  const instanceIds = await Promise.all(payloads.map((payload) => renderEmbed(payload)));
  return instanceIds.filter((instanceId): instanceId is string => instanceId !== null);
}

/** Test seam: forget what this page load has rendered and dismissed. */
export function resetRenderedEmbeds(): void {
  renderedEmbeds.clear();
  dismissedEmbeds.clear();
}
