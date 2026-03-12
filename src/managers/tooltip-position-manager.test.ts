import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findTargetElement, positionTooltip } from './tooltip-position-manager';
import { log } from '../utilities/log';

vi.mock('../utilities/log', () => ({ log: vi.fn() }));

function createTarget(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.id = 'target';
  document.body.appendChild(el);
  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        top: 100,
        bottom: 140,
        left: 200,
        right: 280,
        width: 80,
        height: 40,
        x: 200,
        y: 100,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect
  );
  return el;
}

function createTooltip(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div');
  el.id = 'tooltip';
  document.body.appendChild(el);
  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        top: 0,
        bottom: 50,
        left: 0,
        right: 120,
        width: 120,
        height: 50,
        x: 0,
        y: 0,
        toJSON: () => ({}),
        ...rect,
      }) as DOMRect
  );
  return el;
}

describe('tooltip-position-manager', () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.unstubAllGlobals();
  });

  describe('findTargetElement', () => {
    it('returns the element when selector matches', () => {
      const el = document.createElement('div');
      el.id = 'my-target';
      document.body.appendChild(el);

      expect(findTargetElement('#my-target')).toBe(el);
    });

    it('returns null and logs warning when element not found', () => {
      expect(findTargetElement('#nonexistent')).toBeNull();
      expect(log).toHaveBeenCalledWith(
        'Tooltip target element not found for selector: #nonexistent'
      );
    });

    it('returns null and logs warning for invalid selector', () => {
      expect(findTargetElement('[invalid')).toBeNull();
      expect(log).toHaveBeenCalledWith('Invalid selector for tooltip target: [invalid');
    });
  });

  describe('positionTooltip', () => {
    it('returns null when target element is not found', () => {
      const tooltip = createTooltip({});
      const result = positionTooltip(tooltip, '#missing', 'top');
      expect(result).toBeNull();
    });

    it('returns a cleanup function on success', () => {
      createTarget({});
      const tooltip = createTooltip({});
      cleanup = positionTooltip(tooltip, '#target', 'top');
      expect(typeof cleanup).toBe('function');
    });

    it('positions tooltip above target for "top"', () => {
      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      cleanup = positionTooltip(tooltip, '#target', 'top');

      expect(tooltip.style.position).toBe('absolute');
      expect(tooltip.style.top).toBe('142px');
      expect(tooltip.style.left).toBe('290px');
    });

    it('positions tooltip below target for "bottom"', () => {
      createTarget({ top: 100, bottom: 140, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      cleanup = positionTooltip(tooltip, '#target', 'bottom');

      expect(tooltip.style.top).toBe('148px');
      expect(tooltip.style.left).toBe('290px');
    });

    it('positions tooltip to the left of target for "left"', () => {
      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      cleanup = positionTooltip(tooltip, '#target', 'left');

      expect(tooltip.style.top).toBe('195px');
      expect(tooltip.style.left).toBe('172px');
    });

    it('positions tooltip to the right of target for "right"', () => {
      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      cleanup = positionTooltip(tooltip, '#target', 'right');

      expect(tooltip.style.top).toBe('195px');
      expect(tooltip.style.left).toBe('408px');
    });

    it('accounts for scroll offset in positioning', () => {
      Object.defineProperty(window, 'scrollX', { value: 50, configurable: true });
      Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });

      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      cleanup = positionTooltip(tooltip, '#target', 'bottom');

      expect(tooltip.style.top).toBe('348px');
      expect(tooltip.style.left).toBe('340px');
    });

    describe('viewport edge detection', () => {
      it('flips from top to bottom when tooltip would overflow above viewport', () => {
        createTarget({ top: 30, bottom: 70, left: 300, right: 400, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'top');

        expect(parseFloat(tooltip.style.top)).toBe(78);
      });

      it('flips from bottom to top when tooltip would overflow below viewport', () => {
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
        createTarget({ top: 700, bottom: 740, left: 300, right: 400, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        expect(parseFloat(tooltip.style.top)).toBe(642);
      });

      it('flips from left to right when tooltip would overflow left of viewport', () => {
        createTarget({ top: 200, bottom: 240, left: 30, right: 130, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'left');

        expect(parseFloat(tooltip.style.left)).toBe(138);
      });

      it('flips from right to left when tooltip would overflow right of viewport', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
        createTarget({ top: 200, bottom: 240, left: 900, right: 1000, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'right');

        expect(parseFloat(tooltip.style.left)).toBe(772);
      });

      it('keeps original position when flipped position also does not fit', () => {
        Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
        createTarget({ top: 30, bottom: 70, left: 30, right: 70, width: 40, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'top');

        expect(parseFloat(tooltip.style.top)).toBe(-28);
      });
    });

    describe('DOM detachment safety', () => {
      it('returns null when target is not in the document at initial update', () => {
        const tooltip = createTooltip({});

        const result = positionTooltip(tooltip, '#detached-target', 'top');
        expect(result).toBeNull();
      });

      it('stops repositioning when target is removed from DOM after initial positioning', () => {
        let rafCallback: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
          rafCallback = cb;
          return 1;
        });

        const target = createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        target.remove();

        window.dispatchEvent(new Event('scroll'));
        rafCallback!(0);

        expect(log).toHaveBeenCalledWith(
          'Tooltip or target element removed from DOM, cleaning up listeners'
        );
      });

      it('stops repositioning when tooltip is removed from DOM', () => {
        let rafCallback: FrameRequestCallback | null = null;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
          rafCallback = cb;
          return 1;
        });

        createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        tooltip.remove();

        window.dispatchEvent(new Event('scroll'));
        rafCallback!(0);

        expect(log).toHaveBeenCalledWith(
          'Tooltip or target element removed from DOM, cleaning up listeners'
        );
      });

      it('cleanup is idempotent and can be called multiple times safely', () => {
        createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        cleanup!();
        cleanup!();
        cleanup!();

        cleanup = null;
      });
    });

    describe('scroll and resize listeners', () => {
      it('repositions on scroll events', () => {
        const target = createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        const callCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;

        window.dispatchEvent(new Event('scroll'));

        const newCallCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;
        expect(newCallCount).toBeGreaterThan(callCount);
      });

      it('repositions on resize events', () => {
        const target = createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        const callCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;

        window.dispatchEvent(new Event('resize'));

        const newCallCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;
        expect(newCallCount).toBeGreaterThan(callCount);
      });

      it('cleanup function removes event listeners', () => {
        const target = createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');
        cleanup!();

        const callCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));

        const newCallCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;
        expect(newCallCount).toBe(callCount);
        cleanup = null;
      });

      it('throttles updates via requestAnimationFrame', () => {
        let rafCallback: FrameRequestCallback | null = null;
        let rafCallCount = 0;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
          rafCallback = cb;
          rafCallCount++;
          return rafCallCount;
        });

        createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        cleanup = positionTooltip(tooltip, '#target', 'bottom');

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll'));

        expect(rafCallCount).toBe(1);

        rafCallback!(0);

        window.dispatchEvent(new Event('scroll'));
        expect(rafCallCount).toBe(2);
      });
    });
  });
});
