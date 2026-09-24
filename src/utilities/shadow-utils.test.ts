import { describe, expect, it } from 'vitest';
import { boxShadowToDropShadowFilter } from './shadow-utils';

// Inputs here are real computed serializations (verified against a browser),
// because that is the only shape this ever receives — the renderer reads
// getComputedStyle().boxShadow. The last few cases are malformed on purpose:
// the value crosses a postMessage boundary, so it is treated as untrusted.
describe('boxShadowToDropShadowFilter', () => {
  it('converts a computed single shadow and drops spread', () => {
    expect(boxShadowToDropShadowFilter('rgba(0, 0, 0, 0.1) 0px 2px 4px 0px')).toBe(
      'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))'
    );
  });

  it('tolerates a serialization that puts the colour last', () => {
    expect(boxShadowToDropShadowFilter('0px 2px 4px 0px rgba(0, 0, 0, 0.1)')).toBe(
      'drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))'
    );
  });

  it('emits only the most prominent layer of a multi-shadow list', () => {
    // Chained drop-shadow() filters compose sequentially — the second would
    // shadow the already-shadowed result and compound.
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.1) 0px 2px 4px 0px, rgba(0, 0, 0, 0.2) 0px 8px 16px 2px'
      )
    ).toBe('drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.2))');
  });

  it('picks the most prominent layer regardless of list order', () => {
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.2) 0px 8px 16px 2px, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px'
      )
    ).toBe('drop-shadow(0px 8px 16px rgba(0, 0, 0, 0.2))');
  });

  it('skips inset layers', () => {
    expect(
      boxShadowToDropShadowFilter(
        'rgba(0, 0, 0, 0.3) 0px 1px 2px 0px inset, rgba(0, 0, 0, 0.1) 0px 2px 4px 0px'
      )
    ).toBe('drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.1))');
  });

  it('returns null for inset-only shadow lists', () => {
    expect(boxShadowToDropShadowFilter('rgba(0, 0, 0, 0.3) 0px 1px 2px 0px inset')).toBeNull();
  });

  it('returns null for a spread-only ring, which would paint nothing', () => {
    // Zero offset and zero blur render entirely behind the opaque tooltip.
    // Returning null keeps the template's default shadow in play.
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

  it('returns null when no lengths can be parsed', () => {
    expect(boxShadowToDropShadowFilter('rgba(0, 0, 0, 0.1)')).toBeNull();
  });

  it('returns null for a negative blur, which is invalid in a filter', () => {
    expect(boxShadowToDropShadowFilter('rgb(0, 0, 0) 0px 0px -4px 0px')).toBeNull();
  });

  it('handles negative offsets and decimal lengths', () => {
    expect(boxShadowToDropShadowFilter('rgb(0, 0, 0) -1px -2.5px 0.5px 0px')).toBe(
      'drop-shadow(-1px -2.5px 0.5px rgb(0, 0, 0))'
    );
  });

  it('accepts modern computed colour functions', () => {
    // color-mix() and relative colours resolve to one of these before they
    // reach us, so there are never nested parentheses to parse.
    expect(boxShadowToDropShadowFilter('color(srgb 0.5 0 0.5) 0px 2px 4px 0px')).toBe(
      'drop-shadow(0px 2px 4px color(srgb 0.5 0 0.5))'
    );
    expect(boxShadowToDropShadowFilter('oklch(0.7 0.1 200) 0px 2px 4px 0px')).toBe(
      'drop-shadow(0px 2px 4px oklch(0.7 0.1 200))'
    );
  });

  it('rejects a token with an unbalanced parenthesis instead of re-emitting it', () => {
    // Re-emitting this verbatim would close drop-shadow() early and turn the
    // remainder into a second, caller-chosen filter function.
    expect(
      boxShadowToDropShadowFilter('0 0 1px ) url(https://attacker.example/x.svg#f')
    ).toBeNull();
  });

  it('rejects a stray closing paren without losing comma splitting', () => {
    expect(boxShadowToDropShadowFilter(') 0 0 1px, rgb(0, 0, 0) 0px 2px 4px 0px')).toBe(
      'drop-shadow(0px 2px 4px rgb(0, 0, 0))'
    );
  });

  it('rejects a layer carrying more than one colour token', () => {
    expect(boxShadowToDropShadowFilter('rgb(0, 0, 0) red 0px 2px 4px 0px')).toBeNull();
  });
});
