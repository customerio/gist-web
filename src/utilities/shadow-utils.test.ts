import { afterEach, describe, expect, it, vi } from 'vitest';
import { boxShadowToDropShadowFilter, isSupportedArrowShadow } from './shadow-utils';

describe('boxShadowToDropShadowFilter', () => {
  it('converts a computed single shadow (color first) and drops spread', () => {
    expect(boxShadowToDropShadowFilter('rgba(0, 0, 0, 0.1) 0px 2px 4px 0px')).toBe(
      'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))'
    );
  });

  it('tolerates authored order with the color last', () => {
    expect(boxShadowToDropShadowFilter('0px 2px 4px rgba(0, 0, 0, 0.1)')).toBe(
      'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))'
    );
  });

  it('defaults blur to 0 when only offsets are given', () => {
    expect(boxShadowToDropShadowFilter('rgb(255, 0, 0) 1px 2px')).toBe(
      'drop-shadow(1px 2px 0 rgb(255, 0, 0))'
    );
  });

  it('emits only the most prominent shadow of a multi-shadow list', () => {
    // Chained drop-shadow() filters compose sequentially — the second would
    // shadow the already-shadowed result and compound.
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.1) 0px 2px 4px 0px, rgba(0, 0, 0, 0.2) 0px 8px 16px 2px'
      )
    ).toBe('drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.2))');
  });

  it('picks the most prominent shadow regardless of list order', () => {
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.2) 0px 8px 16px 2px, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px'
      )
    ).toBe('drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.2))');
  });

  it('skips inset shadows', () => {
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.3) 0px 1px 2px 0px inset, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px'
      )
    ).toBe('drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))');
  });

  it('returns null for inset-only shadow lists', () => {
    expect(boxShadowToDropShadowFilter('inset rgba(0, 0, 0, 0.3) 0px 1px 2px')).toBeNull();
  });

  it('returns null for a spread-only ring, which would paint nothing', () => {
    // Zero offset and zero blur render entirely behind the opaque triangle.
    // Returning null keeps the template's default arrow shadow in play.
    expect(boxShadowToDropShadowFilter('rgba(0, 0, 0, 0.1) 0px 0px 0px 1px')).toBeNull();
  });

  it('falls through a spread-only layer to a visible one', () => {
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.1) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px'
      )
    ).toBe('drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))');
  });

  it('returns null for none, empty, null and undefined', () => {
    expect(boxShadowToDropShadowFilter('none')).toBeNull();
    expect(boxShadowToDropShadowFilter('')).toBeNull();
    expect(boxShadowToDropShadowFilter(null)).toBeNull();
    expect(boxShadowToDropShadowFilter(undefined)).toBeNull();
  });

  it('returns null when no offsets can be parsed', () => {
    expect(boxShadowToDropShadowFilter('rgba(0, 0, 0, 0.1)')).toBeNull();
  });

  it('returns null for a negative blur, which is invalid in a filter', () => {
    expect(boxShadowToDropShadowFilter('rgb(0, 0, 0) 0px 0px -4px')).toBeNull();
  });

  it('handles negative offsets and decimal lengths', () => {
    expect(boxShadowToDropShadowFilter('rgb(0, 0, 0) -1px -2.5px 0.5px 0px')).toBe(
      'drop-shadow(-1px -2.5px 0.5px rgb(0, 0, 0))'
    );
  });

  it('accepts modern computed color functions', () => {
    expect(boxShadowToDropShadowFilter('color(display-p3 0 0 0 / 0.1) 0px 2px 4px')).toBe(
      'drop-shadow(0px 2px 4px color(display-p3 0 0 0 / 0.1))'
    );
    expect(boxShadowToDropShadowFilter('#0003 0px 2px 4px')).toBe('drop-shadow(0px 2px 4px #0003)');
  });

  it('rejects a token with an unbalanced parenthesis instead of re-emitting it', () => {
    // Re-emitting this verbatim would close drop-shadow() early and turn the
    // remainder into a second, caller-chosen filter function.
    expect(
      boxShadowToDropShadowFilter('0 0 1px ) url(https://attacker.example/x.svg#f')
    ).toBeNull();
  });

  it('rejects a stray closing paren without losing comma splitting', () => {
    expect(boxShadowToDropShadowFilter(') 0 0 1px, rgb(0, 0, 0) 0px 2px 4px')).toBe(
      'drop-shadow(0px 2px 4px rgb(0, 0, 0))'
    );
  });

  it('rejects a shadow carrying more than one color token', () => {
    expect(boxShadowToDropShadowFilter('rgb(0, 0, 0) red 0px 2px 4px')).toBeNull();
  });
});

describe('isSupportedArrowShadow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defers to CSS.supports when it is available', () => {
    const supports = vi.fn().mockReturnValue(false);
    vi.stubGlobal('CSS', { supports });

    expect(isSupportedArrowShadow('drop-shadow(0 0 -4px red)')).toBe(false);
    expect(supports).toHaveBeenCalledWith('filter', 'drop-shadow(0 0 -4px red)');
  });

  it('passes a value CSS.supports accepts', () => {
    vi.stubGlobal('CSS', { supports: () => true });

    expect(isSupportedArrowShadow('drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))')).toBe(true);
  });

  it('allows the value where CSS.supports is unavailable or throws', () => {
    // jsdom has no CSS object at all; older browsers may lack supports().
    expect(isSupportedArrowShadow('drop-shadow(0px 2px 4px rgb(0, 0, 0))')).toBe(true);

    vi.stubGlobal('CSS', {
      supports: () => {
        throw new Error('nope');
      },
    });
    expect(isSupportedArrowShadow('drop-shadow(0px 2px 4px rgb(0, 0, 0))')).toBe(true);
  });
});
