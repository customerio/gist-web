import { log } from '../utilities/log';
import { findElement } from '../utilities/dom';
import { ARROW_SIZE } from '../templates/tooltip';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

const ARROW_GAP = ARROW_SIZE + 6;
const VIEWPORT_PADDING = 4;

const FALLBACK_ORDER: Record<TooltipPosition, TooltipPosition[]> = {
  top: ['bottom', 'left', 'right'],
  bottom: ['top', 'left', 'right'],
  left: ['right', 'top', 'bottom'],
  right: ['left', 'top', 'bottom'],
};

const OVERFLOW_RE = /auto|scroll/;

const ARROW_CLASS_FOR_POSITION: Record<TooltipPosition, string> = {
  top: 'gist-arrow-bottom',
  bottom: 'gist-arrow-top',
  left: 'gist-arrow-right',
  right: 'gist-arrow-left',
};

export function findTargetElement(selector: string): Element | null {
  const element = findElement(selector);
  if (!element) {
    log(`Tooltip target element not found for selector: ${selector}`);
  }
  return element;
}

function calculatePosition(
  tooltipRect: DOMRect,
  targetRect: DOMRect,
  position: TooltipPosition
): { top: number; left: number } {
  switch (position) {
    case 'top':
      return {
        top: targetRect.top - tooltipRect.height - ARROW_GAP,
        left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
      };
    case 'bottom':
      return {
        top: targetRect.bottom + ARROW_GAP,
        left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
      };
    case 'left':
      return {
        top: targetRect.top + (targetRect.height - tooltipRect.height) / 2,
        left: targetRect.left - tooltipRect.width - ARROW_GAP,
      };
    case 'right':
      return {
        top: targetRect.top + (targetRect.height - tooltipRect.height) / 2,
        left: targetRect.right + ARROW_GAP,
      };
  }
}

function isTargetVisible(targetRect: DOMRect, scrollAncestors: Element[]): boolean {
  if (
    targetRect.bottom <= 0 ||
    targetRect.top >= window.innerHeight ||
    targetRect.right <= 0 ||
    targetRect.left >= window.innerWidth
  ) {
    return false;
  }

  for (const ancestor of scrollAncestors) {
    const ancestorRect = ancestor.getBoundingClientRect();
    if (
      targetRect.bottom <= ancestorRect.top ||
      targetRect.top >= ancestorRect.bottom ||
      targetRect.right <= ancestorRect.left ||
      targetRect.left >= ancestorRect.right
    ) {
      return false;
    }
  }

  return true;
}

function fitsPrimaryAxis(
  coords: { top: number; left: number },
  tooltipRect: DOMRect,
  position: TooltipPosition
): boolean {
  if (position === 'top' || position === 'bottom') {
    return coords.top >= 0 && coords.top + tooltipRect.height <= window.innerHeight;
  }
  return coords.left >= 0 && coords.left + tooltipRect.width <= window.innerWidth;
}

function fitsCrossAxis(tooltipRect: DOMRect, position: TooltipPosition): boolean {
  if (position === 'top' || position === 'bottom') {
    return tooltipRect.width + VIEWPORT_PADDING * 2 <= window.innerWidth;
  }
  return tooltipRect.height + VIEWPORT_PADDING * 2 <= window.innerHeight;
}

interface PositionResult {
  top: number;
  left: number;
  position: TooltipPosition;
  arrowOffset: number | null;
}

function clampCrossAxis(
  coords: { top: number; left: number },
  tooltipRect: DOMRect,
  position: TooltipPosition
): PositionResult {
  let { top, left } = coords;
  let arrowOffset: number | null = null;

  if (position === 'top' || position === 'bottom') {
    const minLeft = VIEWPORT_PADDING;
    const maxLeft = window.innerWidth - tooltipRect.width - VIEWPORT_PADDING;
    if (maxLeft >= minLeft) {
      if (left < minLeft) {
        arrowOffset = left - minLeft;
        left = minLeft;
      } else if (left > maxLeft) {
        arrowOffset = left - maxLeft;
        left = maxLeft;
      }
    }
  } else {
    const minTop = VIEWPORT_PADDING;
    const maxTop = window.innerHeight - tooltipRect.height - VIEWPORT_PADDING;
    if (maxTop >= minTop) {
      if (top < minTop) {
        arrowOffset = top - minTop;
        top = minTop;
      } else if (top > maxTop) {
        arrowOffset = top - maxTop;
        top = maxTop;
      }
    }
  }

  // Ensure the arrow offset doesn't push the arrow outside the tooltip
  if (arrowOffset !== null) {
    const halfTooltip =
      position === 'top' || position === 'bottom' ? tooltipRect.width / 2 : tooltipRect.height / 2;
    const maxArrowShift = halfTooltip - ARROW_GAP - VIEWPORT_PADDING;
    if (Math.abs(arrowOffset) > maxArrowShift) {
      arrowOffset = arrowOffset > 0 ? maxArrowShift : -maxArrowShift;
    }
  }

  return { top, left, position, arrowOffset };
}

function tryPosition(
  tooltipRect: DOMRect,
  targetRect: DOMRect,
  position: TooltipPosition
): PositionResult | null {
  const coords = calculatePosition(tooltipRect, targetRect, position);
  if (!fitsPrimaryAxis(coords, tooltipRect, position)) return null;
  if (!fitsCrossAxis(tooltipRect, position)) return null;
  return clampCrossAxis(coords, tooltipRect, position);
}

function findBestPosition(
  tooltipRect: DOMRect,
  targetRect: DOMRect,
  preferred: TooltipPosition
): PositionResult | null {
  const preferredResult = tryPosition(tooltipRect, targetRect, preferred);
  if (preferredResult) return preferredResult;

  for (const fallback of FALLBACK_ORDER[preferred]) {
    const result = tryPosition(tooltipRect, targetRect, fallback);
    if (result) return result;
  }

  return null;
}

function applyPosition(tooltipElement: HTMLElement, coords: { top: number; left: number }): void {
  tooltipElement.style.position = 'absolute';
  tooltipElement.style.top = `${coords.top + window.scrollY}px`;
  tooltipElement.style.left = `${coords.left + window.scrollX}px`;
}

function updateArrow(tooltipElement: HTMLElement, result: PositionResult): void {
  const arrowEl = tooltipElement.querySelector('.gist-tooltip-arrow') as HTMLElement | null;
  if (!arrowEl) return;

  arrowEl.classList.remove(
    'gist-arrow-top',
    'gist-arrow-bottom',
    'gist-arrow-left',
    'gist-arrow-right'
  );
  arrowEl.classList.add(ARROW_CLASS_FOR_POSITION[result.position]);

  if (result.arrowOffset !== null) {
    if (result.position === 'top' || result.position === 'bottom') {
      arrowEl.style.left = `calc(50% + ${result.arrowOffset}px)`;
      arrowEl.style.removeProperty('top');
    } else {
      arrowEl.style.top = `calc(50% + ${result.arrowOffset}px)`;
      arrowEl.style.removeProperty('left');
    }
  } else {
    if (result.position === 'top' || result.position === 'bottom') {
      arrowEl.style.left = '50%';
      arrowEl.style.removeProperty('top');
    } else {
      arrowEl.style.top = '50%';
      arrowEl.style.removeProperty('left');
    }
  }
}

function getScrollableAncestors(element: Element): Element[] {
  const ancestors: Element[] = [];
  let current = element.parentElement;
  while (current) {
    const style = getComputedStyle(current);
    const overflow = style.overflow + style.overflowX + style.overflowY;
    if (OVERFLOW_RE.test(overflow)) {
      ancestors.push(current);
    }
    current = current.parentElement;
  }
  return ancestors;
}

export interface TooltipHandle {
  cleanup: () => void;
  reposition: () => void;
}

export interface PositionTooltipOptions {
  /**
   * Called when the position manager detects that the target or tooltip element
   * was removed from the DOM unexpectedly (e.g. SPA navigation, dynamic DOM
   * mutation). Not called when the consumer invokes `handle.cleanup()` directly.
   */
  onDetach?: () => void;
}

/**
 * Predicts whether the tooltip can be positioned after the target is scrolled
 * into view. Returns true only when the target exists in the DOM and at least
 * one placement (preferred + fallbacks) would fit the viewport assuming the
 * target occupies a centered viewport position after scrollIntoView.
 */
export function canTooltipFitInViewport(
  tooltipElement: HTMLElement,
  targetSelector: string,
  position: TooltipPosition
): boolean {
  const targetElement = findTargetElement(targetSelector);
  if (!targetElement) return false;

  const targetRect = targetElement.getBoundingClientRect();
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;

  const simulatedTargetRect = new DOMRect(
    Math.max(0, (vpW - targetRect.width) / 2),
    Math.max(0, (vpH - targetRect.height) / 2),
    targetRect.width,
    targetRect.height
  );

  tooltipElement.style.display = '';
  const tooltipRect = tooltipElement.getBoundingClientRect();

  return findBestPosition(tooltipRect, simulatedTargetRect, position) !== null;
}

const SCROLL_POLL_INTERVAL_MS = 50;
const SCROLL_SETTLE_TIMEOUT_MS = 1000;

function waitForScrollSettle(targetElement: Element): Promise<void> {
  return new Promise<void>((resolve) => {
    let lastRect = targetElement.getBoundingClientRect();
    let stableFrames = 0;
    const start = Date.now();

    function check(): void {
      const currentRect = targetElement.getBoundingClientRect();
      if (
        Math.abs(currentRect.top - lastRect.top) < 1 &&
        Math.abs(currentRect.left - lastRect.left) < 1
      ) {
        stableFrames++;
      } else {
        stableFrames = 0;
      }
      lastRect = currentRect;

      if (stableFrames >= 2 || Date.now() - start > SCROLL_SETTLE_TIMEOUT_MS) {
        resolve();
        return;
      }
      setTimeout(check, SCROLL_POLL_INTERVAL_MS);
    }

    setTimeout(check, SCROLL_POLL_INTERVAL_MS);
  });
}

/**
 * If the target is already visible, resolves immediately.
 * Otherwise, if `canTooltipFitInViewport` predicts a valid placement, smoothly
 * scrolls the target into view (including within nested scroll containers) and
 * waits for the scroll to settle. Returns false without scrolling when the
 * preflight fails.
 */
export async function ensureTargetInView(
  tooltipElement: HTMLElement,
  targetSelector: string,
  position: TooltipPosition
): Promise<boolean> {
  const targetElement = findTargetElement(targetSelector);
  if (!targetElement) return false;

  let scrollAncestors: Element[] = [];
  try {
    scrollAncestors = getScrollableAncestors(targetElement);
  } catch {
    // getComputedStyle may throw in test environments
  }

  const targetRect = targetElement.getBoundingClientRect();
  if (isTargetVisible(targetRect, scrollAncestors)) {
    return true;
  }

  if (!canTooltipFitInViewport(tooltipElement, targetSelector, position)) {
    log(
      `Preflight failed: tooltip would not fit after scrolling target "${targetSelector}" into view`
    );
    return false;
  }

  targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

  await waitForScrollSettle(targetElement);

  const postScrollRect = targetElement.getBoundingClientRect();
  let postScrollAncestors: Element[] = [];
  try {
    postScrollAncestors = getScrollableAncestors(targetElement);
  } catch {
    // ignore
  }

  return isTargetVisible(postScrollRect, postScrollAncestors);
}

export function positionTooltip(
  tooltipElement: HTMLElement,
  targetSelector: string,
  position: TooltipPosition,
  options?: PositionTooltipOptions
): TooltipHandle | null {
  const targetElement = findTargetElement(targetSelector);
  if (!targetElement) {
    return null;
  }

  let rafId: number | null = null;
  let cleaned = false;
  let scrollAncestors: Element[] = [];
  let observer: MutationObserver | null = null;

  try {
    scrollAncestors = getScrollableAncestors(targetElement);
  } catch {
    // getComputedStyle may throw in test environments
  }

  function update(): void {
    if (cleaned) {
      return;
    }

    if (!targetElement || !document.contains(targetElement) || !document.contains(tooltipElement)) {
      log(`Tooltip or target element removed from DOM, cleaning up listeners`);
      cleanup();
      options?.onDetach?.();
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();

    if (!isTargetVisible(targetRect, scrollAncestors)) {
      tooltipElement.style.display = 'none';
      return;
    }

    tooltipElement.style.display = '';
    const tooltipRect = tooltipElement.getBoundingClientRect();

    const result = findBestPosition(tooltipRect, targetRect, position);

    if (!result) {
      tooltipElement.style.display = 'none';
      return;
    }

    applyPosition(tooltipElement, result);
    updateArrow(tooltipElement, result);
  }

  function onScrollOrResize(): void {
    if (rafId !== null) {
      return;
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      update();
    });
  }

  function cleanup(): void {
    if (cleaned) {
      return;
    }
    cleaned = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    window.removeEventListener('scroll', onScrollOrResize);
    window.removeEventListener('resize', onScrollOrResize);
    for (const ancestor of scrollAncestors) {
      ancestor.removeEventListener('scroll', onScrollOrResize);
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  update();

  if (cleaned) {
    return null;
  }

  window.addEventListener('scroll', onScrollOrResize, { passive: true });
  window.addEventListener('resize', onScrollOrResize, { passive: true });
  for (const ancestor of scrollAncestors) {
    ancestor.addEventListener('scroll', onScrollOrResize, { passive: true });
  }

  try {
    observer = new MutationObserver(() => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!document.contains(targetElement)) {
          update();
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch {
    // MutationObserver may not be available in some test environments
  }

  return { cleanup, reposition: update };
}
