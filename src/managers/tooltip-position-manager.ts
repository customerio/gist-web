import { log } from '../utilities/log';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

const ARROW_SIZE = 10;
const ARROW_GAP = ARROW_SIZE + 6;
const VIEWPORT_PADDING = 4;

const FALLBACK_ORDER: Record<TooltipPosition, TooltipPosition[]> = {
  top: ['bottom', 'left', 'right'],
  bottom: ['top', 'left', 'right'],
  left: ['right', 'top', 'bottom'],
  right: ['left', 'top', 'bottom'],
};

const ARROW_CLASS_FOR_POSITION: Record<TooltipPosition, string> = {
  top: 'gist-arrow-bottom',
  bottom: 'gist-arrow-top',
  left: 'gist-arrow-right',
  right: 'gist-arrow-left',
};

export function findTargetElement(selector: string): Element | null {
  try {
    const element = document.querySelector(selector);
    if (!element) {
      log(`Tooltip target element not found for selector: ${selector}`);
    }
    return element;
  } catch {
    log(`Invalid selector for tooltip target: ${selector}`);
    return null;
  }
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

function getFlippedPosition(position: TooltipPosition): TooltipPosition {
  const flips: Record<TooltipPosition, TooltipPosition> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  };
  return flips[position];
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

function fitsInViewport(coords: { top: number; left: number }, tooltipRect: DOMRect): boolean {
  return (
    coords.top >= 0 &&
    coords.left >= 0 &&
    coords.top + tooltipRect.height <= window.innerHeight &&
    coords.left + tooltipRect.width <= window.innerWidth
  );
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

function findBestPosition(
  tooltipRect: DOMRect,
  targetRect: DOMRect,
  preferred: TooltipPosition
): PositionResult | null {
  const preferredCoords = calculatePosition(tooltipRect, targetRect, preferred);

  if (fitsInViewport(preferredCoords, tooltipRect)) {
    return clampCrossAxis(preferredCoords, tooltipRect, preferred);
  }

  // Try the simple flip first (backward compat)
  const flipped = getFlippedPosition(preferred);
  const flippedCoords = calculatePosition(tooltipRect, targetRect, flipped);
  if (fitsInViewport(flippedCoords, tooltipRect)) {
    return clampCrossAxis(flippedCoords, tooltipRect, flipped);
  }

  // Try remaining positions
  for (const fallback of FALLBACK_ORDER[preferred]) {
    if (fallback === flipped) continue;
    const coords = calculatePosition(tooltipRect, targetRect, fallback);
    if (fitsInViewport(coords, tooltipRect)) {
      return clampCrossAxis(coords, tooltipRect, fallback);
    }
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
      arrowEl.style.left = `calc(50% + ${-result.arrowOffset}px)`;
      arrowEl.style.removeProperty('top');
    } else {
      arrowEl.style.top = `calc(50% + ${-result.arrowOffset}px)`;
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
    if (/auto|scroll/.test(overflow)) {
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

export function positionTooltip(
  tooltipElement: HTMLElement,
  targetSelector: string,
  position: TooltipPosition
): TooltipHandle | null {
  const targetElement = findTargetElement(targetSelector);
  if (!targetElement) {
    return null;
  }

  let rafId: number | null = null;
  let cleaned = false;
  let scrollAncestors: Element[] = [];

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

  return { cleanup, reposition: update };
}
