import { log } from '../utilities/log';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

const OFFSET = 8;

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
        top: targetRect.top - tooltipRect.height - OFFSET,
        left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
      };
    case 'bottom':
      return {
        top: targetRect.bottom + OFFSET,
        left: targetRect.left + (targetRect.width - tooltipRect.width) / 2,
      };
    case 'left':
      return {
        top: targetRect.top + (targetRect.height - tooltipRect.height) / 2,
        left: targetRect.left - tooltipRect.width - OFFSET,
      };
    case 'right':
      return {
        top: targetRect.top + (targetRect.height - tooltipRect.height) / 2,
        left: targetRect.right + OFFSET,
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

function fitsInViewport(coords: { top: number; left: number }, tooltipRect: DOMRect): boolean {
  return (
    coords.top >= 0 &&
    coords.left >= 0 &&
    coords.top + tooltipRect.height <= window.innerHeight &&
    coords.left + tooltipRect.width <= window.innerWidth
  );
}

function applyPosition(tooltipElement: HTMLElement, coords: { top: number; left: number }): void {
  tooltipElement.style.position = 'absolute';
  tooltipElement.style.top = `${coords.top + window.scrollY}px`;
  tooltipElement.style.left = `${coords.left + window.scrollX}px`;
}

export function positionTooltip(
  tooltipElement: HTMLElement,
  targetSelector: string,
  position: TooltipPosition
): (() => void) | null {
  const targetElement = findTargetElement(targetSelector);
  if (!targetElement) {
    return null;
  }

  let rafId: number | null = null;
  let cleaned = false;

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
    const tooltipRect = tooltipElement.getBoundingClientRect();

    let coords = calculatePosition(tooltipRect, targetRect, position);

    if (!fitsInViewport(coords, tooltipRect)) {
      const flipped = getFlippedPosition(position);
      const flippedCoords = calculatePosition(tooltipRect, targetRect, flipped);
      if (fitsInViewport(flippedCoords, tooltipRect)) {
        coords = flippedCoords;
      }
    }

    applyPosition(tooltipElement, coords);
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

  return cleanup;
}
