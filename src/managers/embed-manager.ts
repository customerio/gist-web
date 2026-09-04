import { log } from '../utilities/log';
import { findElement, waitForElement } from '../utilities/dom';
import { embedMessage } from './message-manager';
import { resolveMessageProperties } from './gist-properties-manager';
import { setKeyToLocalStore, getKeyFromLocalStore } from '../utilities/local-storage';
import type { EmbedPayload, GistMessage } from '../types';

// One key holds the state for every embed on the browser, rather than a key per
// embed: it keeps the store inspectable in one place, clearable in one call, and
// stops embed ids from sprawling across the key space.
const embedStateStoreName = 'gist.web.embeds';

/** Attribute naming the container an embed renders into. */
export const EMBED_TARGET_ATTRIBUTE = 'data-cio-embed';
/** Attribute naming the JSON payload block for an embed. */
export const EMBED_PAYLOAD_ATTRIBUTE = 'data-cio-embed-payload';

const EMBED_PAYLOAD_SELECTOR = `script[type="application/json"][${EMBED_PAYLOAD_ATTRIBUTE}]`;

// The container is usually in the DOM before the SDK runs, but a snippet placed
// above its own markup, or a page that renders the container client-side, needs
// a grace period before we give up on it.
const TARGET_WAIT_MS = 10000;

interface EmbedState {
  /** Embeds that must never render again on this browser. */
  neverShow: string[];
  /** Embeds hidden until a moment in time, as epoch milliseconds. */
  hideUntil: Record<string, number>;
}

// Embeds currently occupying their container. Guards a loader that runs twice, a
// framework that re-mounts, and two concurrent renders of the same payload. A
// claim is released once the message is torn down (releaseEmbedClaim), so an
// embed whose container a route change replaced can be mounted again.
const renderedEmbeds = new Set<string>();

// Embeds the visitor closed during this page load. Held in memory rather than in
// the store so an "always" embed still stays closed once dismissed without
// persisting anything about the visitor; a genuine page load clears it.
const dismissedEmbeds = new Set<string>();

// Whether this page load has already rewritten the record. The store stamps a
// fixed expiry on write, so a record that is only written when state changes
// would expire a year after the visitor's last dismissal — and "never render
// again" has to outlive that. Rewriting once per page load turns the expiry
// into a sliding window: the state survives as long as the visitor keeps
// coming back, and a record nobody has visited for a year is still collected.
let stateRefreshedThisLoad = false;

function emptyState(): EmbedState {
  return { neverShow: [], hideUntil: {} };
}

// The stored record with lapsed hideUntil entries dropped, or null when the
// visitor has no state at all. neverShow is not pruned: it grows with the number
// of distinct embeds a visitor has finished with, bounded by how many the site
// has.
function prunedState(): EmbedState | null {
  const stored = getKeyFromLocalStore(embedStateStoreName) as Partial<EmbedState> | null;
  if (!stored) return null;

  const now = Date.now();
  const hideUntil: Record<string, number> = {};
  for (const [embedId, until] of Object.entries(stored.hideUntil ?? {})) {
    if (typeof until === 'number' && until > now) {
      hideUntil[embedId] = until;
    }
  }

  return {
    neverShow: Array.isArray(stored.neverShow) ? stored.neverShow.filter((id) => !!id) : [],
    hideUntil,
  };
}

function persistEmbedState(state: EmbedState): void {
  setKeyToLocalStore(embedStateStoreName, state);
  stateRefreshedThisLoad = true;
}

function readEmbedState(): EmbedState {
  const state = prunedState();
  if (!state) {
    // Nothing stored, so nothing to refresh: a page carrying only `always`
    // embeds never writes here.
    return emptyState();
  }
  if (!stateRefreshedThisLoad) {
    // Slides the expiry, and persists the prune above so lapsed entries are
    // actually shed rather than just hidden from this caller.
    persistEmbedState(state);
  }
  return state;
}

// Read immediately before every write: the record is shared by every embed on
// the page, so a stale copy held across an await would drop another embed's
// state.
function updateEmbedState(mutate: (state: EmbedState) => void): void {
  const state = prunedState() ?? emptyState();
  mutate(state);
  persistEmbedState(state);
}

/**
 * Whether the embed may render now. Deliberately frequency-agnostic: the rule
 * decides what gets written, and this only reports what was. Any storage failure
 * resolves to "render" — an embed is page content, and losing frequency capping
 * is a smaller failure than leaving a hole in the customer's layout.
 */
export function shouldRenderEmbed(embedId: string): boolean {
  if (dismissedEmbeds.has(embedId)) {
    return false;
  }

  const state = readEmbedState();
  if (state.neverShow.includes(embedId)) {
    return false;
  }
  // Lapsed entries were pruned on read, so any survivor is still in force.
  return state.hideUntil[embedId] === undefined;
}

/** Records a render. Only `onceEver` has anything to remember. */
export function recordEmbedShown(message: GistMessage): void {
  const embedId = message.embedId;
  if (!embedId) return;

  if (resolveMessageProperties(message).embedFrequency !== 'onceEver') return;

  updateEmbedState((state) => {
    if (!state.neverShow.includes(embedId)) {
      state.neverShow.push(embedId);
    }
  });
  log(`Embed ${embedId} shown once and will not render again.`);
}

/**
 * Records that the visitor closed the message. Only `untilDismissed` persists
 * it; every other rule expects the embed back on the next page load, so the
 * close is remembered in memory for this one only.
 */
export function recordEmbedDismissed(message: GistMessage): void {
  const embedId = message.embedId;
  if (!embedId) return;

  dismissedEmbeds.add(embedId);

  const properties = resolveMessageProperties(message);
  if (properties.embedFrequency !== 'untilDismissed') return;

  const minutes = properties.embedReshowAfterMinutes;
  if (minutes > 0) {
    const until = Date.now() + minutes * 60 * 1000;
    updateEmbedState((state) => {
      state.hideUntil[embedId] = until;
    });
    log(`Embed ${embedId} dismissed, hidden for ${minutes} minute(s).`);
  } else {
    updateEmbedState((state) => {
      if (!state.neverShow.includes(embedId)) {
        state.neverShow.push(embedId);
      }
    });
    log(`Embed ${embedId} dismissed and will not render again.`);
  }
}

/**
 * Hides the embed until a later moment. A snooze is not a dismissal — the
 * visitor asked to see it again — so it never marks the embed as never-show and
 * never records a dismissal, whatever the frequency rule is.
 */
export function snoozeEmbed(message: GistMessage, minutes: number): void {
  const embedId = message.embedId;
  if (!embedId || !(minutes > 0)) return;

  const until = Date.now() + minutes * 60 * 1000;
  updateEmbedState((state) => {
    state.hideUntil[embedId] = until;
  });
  log(`Embed ${embedId} snoozed for ${minutes} minute(s).`);
}

/** Forgets an embed's stored state. For QA and host "show me again" affordances. */
export function clearEmbedState(embedId: string): void {
  updateEmbedState((state) => {
    state.neverShow = state.neverShow.filter((id) => id !== embedId);
    delete state.hideUntil[embedId];
  });
  renderedEmbeds.delete(embedId);
  dismissedEmbeds.delete(embedId);
  log(`Embed ${embedId} state cleared.`);
}

/**
 * Releases an embed's container claim once its message has been torn down, so a
 * host that re-mounts after replacing the markup (an SPA route change, say) can
 * render it again. Whether it *should* render is still the stored state's call —
 * a dismissal outlives the claim.
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
  // An embed is pinned inside the host's element. The payload is host-supplied,
  // so the display fields that would take the message out of that element are
  // cleared here, at the boundary, rather than clamped at each point downstream.
  message.overlay = false;
  message.tooltipPosition = undefined;
  message.position = null;
  delete message.properties.gist.tooltipPosition;
  delete message.properties.gist.position;

  if (!shouldRenderEmbed(embedId)) {
    log(`Embed ${embedId} is suppressed by its stored state.`);
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
 * The embed payloads a page declares, without rendering or initializing
 * anything — so a caller can decide whether there is any work to do (and which
 * site the work belongs to) before setting the SDK up.
 */
export function readEmbedPayloads(): EmbedPayload[] {
  return [...document.querySelectorAll(EMBED_PAYLOAD_SELECTOR)]
    .map(parseEmbedPayload)
    .filter((payload): payload is EmbedPayload => payload !== null);
}

/**
 * Renders the given payloads. Safe to call repeatedly — already-rendered embeds
 * are skipped — so a host can call it again after injecting new markup.
 *
 * Rendered concurrently: each embed waits for its own container to appear, so
 * one container that never arrives would otherwise hold up every embed behind it
 * for the whole timeout.
 */
export async function renderEmbeds(payloads: EmbedPayload[]): Promise<string[]> {
  log(`Rendering ${payloads.length} embed(s).`);
  const instanceIds = await Promise.all(payloads.map((payload) => renderEmbed(payload)));
  return instanceIds.filter((instanceId): instanceId is string => instanceId !== null);
}

/** Test seam: forget what this page load has rendered, dismissed and refreshed. */
export function resetRenderedEmbeds(): void {
  renderedEmbeds.clear();
  dismissedEmbeds.clear();
  stateRefreshedThisLoad = false;
}
