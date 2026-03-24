import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  findTargetElement,
  positionTooltip,
  canTooltipFitInViewport,
  ensureTargetInView,
  type TooltipHandle,
} from './tooltip-position-manager';
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
  let handle: TooltipHandle | null = null;

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
    handle?.cleanup();
    handle = null;
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

    it('returns a handle with cleanup and reposition on success', () => {
      createTarget({});
      const tooltip = createTooltip({});
      handle = positionTooltip(tooltip, '#target', 'top');
      expect(handle).not.toBeNull();
      expect(typeof handle!.cleanup).toBe('function');
      expect(typeof handle!.reposition).toBe('function');
    });

    it('positions tooltip above target for "top"', () => {
      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      handle = positionTooltip(tooltip, '#target', 'top');

      expect(tooltip.style.position).toBe('absolute');
      expect(tooltip.style.top).toBe('134px');
      expect(tooltip.style.left).toBe('290px');
    });

    it('positions tooltip below target for "bottom"', () => {
      createTarget({ top: 100, bottom: 140, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      handle = positionTooltip(tooltip, '#target', 'bottom');

      expect(tooltip.style.top).toBe('156px');
      expect(tooltip.style.left).toBe('290px');
    });

    it('positions tooltip to the left of target for "left"', () => {
      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      handle = positionTooltip(tooltip, '#target', 'left');

      expect(tooltip.style.top).toBe('195px');
      expect(tooltip.style.left).toBe('164px');
    });

    it('positions tooltip to the right of target for "right"', () => {
      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      handle = positionTooltip(tooltip, '#target', 'right');

      expect(tooltip.style.top).toBe('195px');
      expect(tooltip.style.left).toBe('416px');
    });

    it('accounts for scroll offset in positioning', () => {
      Object.defineProperty(window, 'scrollX', { value: 50, configurable: true });
      Object.defineProperty(window, 'scrollY', { value: 100, configurable: true });

      createTarget({ top: 200, bottom: 240, left: 300, right: 400, width: 100, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      handle = positionTooltip(tooltip, '#target', 'bottom');

      expect(tooltip.style.top).toBe('356px');
      expect(tooltip.style.left).toBe('340px');
    });

    describe('viewport edge detection', () => {
      it('flips from top to bottom when tooltip would overflow above viewport', () => {
        createTarget({ top: 30, bottom: 70, left: 300, right: 400, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'top');

        expect(parseFloat(tooltip.style.top)).toBe(86);
      });

      it('flips from bottom to top when tooltip would overflow below viewport', () => {
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
        createTarget({ top: 700, bottom: 740, left: 300, right: 400, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'bottom');

        expect(parseFloat(tooltip.style.top)).toBe(634);
      });

      it('flips from left to right when tooltip would overflow left of viewport', () => {
        createTarget({ top: 200, bottom: 240, left: 30, right: 130, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'left');

        expect(parseFloat(tooltip.style.left)).toBe(146);
      });

      it('flips from right to left when tooltip would overflow right of viewport', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
        createTarget({ top: 200, bottom: 240, left: 900, right: 1000, width: 100, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'right');

        expect(parseFloat(tooltip.style.left)).toBe(764);
      });

      it('hides tooltip when target scrolls out of viewport', () => {
        const target = createTarget({
          top: -100,
          bottom: -60,
          left: 300,
          right: 400,
          width: 100,
          height: 40,
        });
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'bottom');

        expect(tooltip.style.display).toBe('none');

        (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({
          top: 200,
          bottom: 240,
          left: 300,
          right: 400,
          width: 100,
          height: 40,
          x: 300,
          y: 200,
          toJSON: () => ({}),
        });

        window.dispatchEvent(new Event('scroll'));

        expect(tooltip.style.display).toBe('');
      });

      it('hides tooltip when no position fits the viewport', () => {
        Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
        createTarget({ top: 30, bottom: 70, left: 30, right: 70, width: 40, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'top');

        expect(tooltip.style.display).toBe('none');
      });

      it('flips from left to right and clamps cross-axis when target is near top-left corner', () => {
        Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true });

        createTarget({
          top: 10,
          bottom: 50,
          left: 10,
          right: 90,
          width: 80,
          height: 40,
        });
        const tooltip = createTooltip({ width: 200, height: 100 });
        handle = positionTooltip(tooltip, '#target', 'left');

        expect(handle).not.toBeNull();
        expect(tooltip.style.display).not.toBe('none');
        // left doesn't fit primary axis, flips to right: left = 90 + 16 = 106
        expect(parseFloat(tooltip.style.left)).toBe(106);
        // cross-axis top = 10 + (40-100)/2 = -20, clamped to VIEWPORT_PADDING = 4
        expect(parseFloat(tooltip.style.top)).toBe(4);
      });

      it('clamps cross-axis left when bottom tooltip overflows left of viewport', () => {
        // Target near left edge: tooltip (width 280) centered on target at left=20
        // would compute left = 20 + (60-280)/2 = -90, which overflows left.
        // Previously this was rejected outright; now it should clamp to VIEWPORT_PADDING.
        createTarget({ top: 100, bottom: 140, left: 20, right: 80, width: 60, height: 40 });
        const tooltip = createTooltip({ width: 280, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'bottom');

        expect(handle).not.toBeNull();
        expect(tooltip.style.display).not.toBe('none');
        expect(parseFloat(tooltip.style.left)).toBe(4); // VIEWPORT_PADDING
      });

      it('clamps cross-axis right when bottom tooltip overflows right of viewport', () => {
        // Target near right edge: tooltip (width 280) centered on target at left=900
        // would compute left = 900 + (60-280)/2 = 790, right edge = 1070 > 1024
        createTarget({ top: 100, bottom: 140, left: 900, right: 960, width: 60, height: 40 });
        const tooltip = createTooltip({ width: 280, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'bottom');

        expect(handle).not.toBeNull();
        expect(tooltip.style.display).not.toBe('none');
        // maxLeft = 1024 - 280 - 4 = 740
        expect(parseFloat(tooltip.style.left)).toBe(740);
      });

      it('clamps cross-axis top when right tooltip overflows top of viewport', () => {
        // Target near top edge: tooltip (height 120) centered on target at top=20
        // would compute top = 20 + (40-120)/2 = -20, which overflows top.
        createTarget({ top: 20, bottom: 60, left: 100, right: 160, width: 60, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 120 });
        handle = positionTooltip(tooltip, '#target', 'right');

        expect(handle).not.toBeNull();
        expect(tooltip.style.display).not.toBe('none');
        expect(parseFloat(tooltip.style.top)).toBe(4); // VIEWPORT_PADDING
      });

      it('clamps cross-axis bottom when left tooltip overflows bottom of viewport', () => {
        // Target near bottom edge: tooltip (height 120) centered on target at top=700
        // would compute top = 700 + (40-120)/2 = 660, bottom edge = 780 > 768
        createTarget({ top: 700, bottom: 740, left: 300, right: 360, width: 60, height: 40 });
        const tooltip = createTooltip({ width: 120, height: 120 });
        handle = positionTooltip(tooltip, '#target', 'left');

        expect(handle).not.toBeNull();
        expect(tooltip.style.display).not.toBe('none');
        // maxTop = 768 - 120 - 4 = 644
        expect(parseFloat(tooltip.style.top)).toBe(644);
      });

      it('tracks arrow offset when cross-axis is clamped', () => {
        // Arrow element should get an offset when the tooltip is shifted
        const arrowEl = document.createElement('div');
        arrowEl.className = 'gist-tooltip-arrow';

        createTarget({ top: 100, bottom: 140, left: 20, right: 80, width: 60, height: 40 });
        const tooltip = createTooltip({ width: 280, height: 50 });
        tooltip.appendChild(arrowEl);
        handle = positionTooltip(tooltip, '#target', 'bottom');

        expect(handle).not.toBeNull();
        // Centered left = 20 + (60-280)/2 = -90. Clamped to 4.
        // arrowOffset = -90 - 4 = -94, but capped by maxArrowShift = 280/2 - 16 - 4 = 120
        // So arrowOffset = -94 (within bounds)
        expect(arrowEl.style.left).not.toBe('50%');
        expect(arrowEl.style.left).toContain('calc(50%');
      });

      it('re-shows tooltip when a valid position becomes available after being hidden', () => {
        const target = createTarget({
          top: 10,
          bottom: 50,
          left: 10,
          right: 90,
          width: 80,
          height: 40,
        });
        const tooltip = createTooltip({ width: 200, height: 100 });

        Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });

        handle = positionTooltip(tooltip, '#target', 'bottom');
        expect(tooltip.style.display).toBe('none');

        // Viewport grows, target moves to a position where bottom fits
        Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
        (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({
          top: 200,
          bottom: 240,
          left: 300,
          right: 380,
          width: 80,
          height: 40,
          x: 300,
          y: 200,
          toJSON: () => ({}),
        });

        window.dispatchEvent(new Event('resize'));
        expect(tooltip.style.display).toBe('');
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
        handle = positionTooltip(tooltip, '#target', 'bottom');

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
        handle = positionTooltip(tooltip, '#target', 'bottom');

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
        handle = positionTooltip(tooltip, '#target', 'bottom');

        handle!.cleanup();
        handle!.cleanup();
        handle!.cleanup();

        handle = null;
      });
    });

    describe('scroll and resize listeners', () => {
      it('repositions on scroll events', () => {
        const target = createTarget({});
        const tooltip = createTooltip({ width: 120, height: 50 });
        handle = positionTooltip(tooltip, '#target', 'bottom');

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
        handle = positionTooltip(tooltip, '#target', 'bottom');

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
        handle = positionTooltip(tooltip, '#target', 'bottom');
        handle!.cleanup();

        const callCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));

        const newCallCount = (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mock.calls
          .length;
        expect(newCallCount).toBe(callCount);
        handle = null;
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
        handle = positionTooltip(tooltip, '#target', 'bottom');

        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scroll'));

        expect(rafCallCount).toBe(1);

        rafCallback!(0);

        window.dispatchEvent(new Event('scroll'));
        expect(rafCallCount).toBe(2);
      });
    });
  });

  describe('canTooltipFitInViewport', () => {
    it('returns true when tooltip fits around a centered target', () => {
      createTarget({ top: 400, bottom: 440, left: 500, right: 580, width: 80, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      expect(canTooltipFitInViewport(tooltip, '#target', 'bottom')).toBe(true);
    });

    it('returns false when target element is not found', () => {
      const tooltip = createTooltip({ width: 120, height: 50 });
      expect(canTooltipFitInViewport(tooltip, '#missing', 'bottom')).toBe(false);
    });

    it('returns false when tooltip is too large for the viewport', () => {
      Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
      createTarget({ top: 30, bottom: 70, left: 30, right: 70, width: 40, height: 40 });
      const tooltip = createTooltip({ width: 200, height: 200 });
      expect(canTooltipFitInViewport(tooltip, '#target', 'bottom')).toBe(false);
    });
  });

  describe('ensureTargetInView', () => {
    it('resolves true immediately when target is already visible', async () => {
      createTarget({ top: 100, bottom: 140, left: 200, right: 280, width: 80, height: 40 });
      const tooltip = createTooltip({ width: 120, height: 50 });
      const result = await ensureTargetInView(tooltip, '#target', 'bottom');
      expect(result).toBe(true);
    });

    it('returns false when target element is not found', async () => {
      const tooltip = createTooltip({ width: 120, height: 50 });
      const result = await ensureTargetInView(tooltip, '#missing', 'bottom');
      expect(result).toBe(false);
    });

    it('smooth-scrolls target into view when offscreen and preflight passes', async () => {
      const target = createTarget({
        top: -200,
        bottom: -160,
        left: 200,
        right: 280,
        width: 80,
        height: 40,
      });
      const tooltip = createTooltip({ width: 120, height: 50 });

      target.scrollIntoView = vi.fn(() => {
        (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({
          top: 300,
          bottom: 340,
          left: 200,
          right: 280,
          width: 80,
          height: 40,
          x: 200,
          y: 300,
          toJSON: () => ({}),
        });
      });

      const result = await ensureTargetInView(tooltip, '#target', 'bottom');
      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
      expect(result).toBe(true);
    });

    it('scrolls target inside a scrollable ancestor into view', async () => {
      const scrollContainer = document.createElement('div');
      scrollContainer.id = 'scroll-container';
      Object.defineProperty(scrollContainer, 'style', {
        value: { overflow: 'auto', overflowX: '', overflowY: '' },
        writable: true,
      });
      document.body.appendChild(scrollContainer);

      const target = document.createElement('div');
      target.id = 'nested-target';
      scrollContainer.appendChild(target);

      const clippedRect = {
        top: -100,
        bottom: -60,
        left: 200,
        right: 280,
        width: 80,
        height: 40,
        x: 200,
        y: -100,
        toJSON: () => ({}),
      } as DOMRect;
      target.getBoundingClientRect = vi.fn(() => clippedRect);

      scrollContainer.getBoundingClientRect = vi.fn(
        () =>
          ({
            top: 50,
            bottom: 350,
            left: 100,
            right: 500,
            width: 400,
            height: 300,
            x: 100,
            y: 50,
            toJSON: () => ({}),
          }) as DOMRect
      );

      const tooltip = createTooltip({ width: 120, height: 50 });
      target.scrollIntoView = vi.fn(() => {
        (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({
          top: 180,
          bottom: 220,
          left: 200,
          right: 280,
          width: 80,
          height: 40,
          x: 200,
          y: 180,
          toJSON: () => ({}),
        });
      });

      const result = await ensureTargetInView(tooltip, '#nested-target', 'right');
      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      });
      expect(result).toBe(true);
    });

    it('waits for horizontal scroll to settle before resolving', async () => {
      const target = createTarget({
        top: -200,
        bottom: -160,
        left: -300,
        right: -220,
        width: 80,
        height: 40,
      });
      const tooltip = createTooltip({ width: 120, height: 50 });

      let callCount = 0;
      target.scrollIntoView = vi.fn(() => {
        callCount = 0;
        (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockImplementation(() => {
          callCount++;
          if (callCount <= 2) {
            return {
              top: 300,
              bottom: 340,
              left: 200 + (3 - callCount) * 40,
              right: 280 + (3 - callCount) * 40,
              width: 80,
              height: 40,
              x: 200 + (3 - callCount) * 40,
              y: 300,
              toJSON: () => ({}),
            };
          }
          return {
            top: 300,
            bottom: 340,
            left: 200,
            right: 280,
            width: 80,
            height: 40,
            x: 200,
            y: 300,
            toJSON: () => ({}),
          };
        });
      });

      const result = await ensureTargetInView(tooltip, '#target', 'bottom');
      expect(target.scrollIntoView).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('does not scroll when preflight predicts tooltip will not fit', async () => {
      Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });
      const target = createTarget({
        top: -200,
        bottom: -160,
        left: 200,
        right: 280,
        width: 80,
        height: 40,
      });
      const tooltip = createTooltip({ width: 200, height: 200 });
      target.scrollIntoView = vi.fn();

      const result = await ensureTargetInView(tooltip, '#target', 'bottom');
      expect(target.scrollIntoView).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
