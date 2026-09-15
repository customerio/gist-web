// Converts a computed CSS box-shadow list (as reported by the renderer via
// messageBackgroundChanged) into an equivalent drop-shadow() filter for the
// tooltip arrow. The arrow is a CSS border triangle on a 0x0 box, so
// box-shadow cannot render on it; filter: drop-shadow() follows the painted
// triangle instead.
//
// Differences accepted by design:
// - drop-shadow() has no spread parameter, so spread is dropped.
// - inset shadows have no drop-shadow() equivalent and are skipped.
// - Only the most prominent shadow of a multi-shadow list is emitted. Filter
//   functions compose sequentially, so chaining drop-shadow() would cast the
//   second shadow from the already-shadowed result and compound into
//   something visibly darker than the message body it should match.
//
// Input is expected to be a computed value (browser-serialized), which is why
// tokens are validated against that shape rather than the full authored
// box-shadow grammar. Anything unrecognized is rejected rather than re-emitted:
// a token carrying an unbalanced parenthesis would otherwise close
// drop-shadow() early and turn the remainder into a second filter function.
//
// Mirrored, in ES5 form, by the editor preview in customerio/parcel at
// app/src/pages/embed/cio/in-app/components/tooltip-indicator.tsx — keep the
// two in sync.

const LENGTH_RE = /^-?(\d+\.?\d*|\.\d+)([a-z%]*)$/i;
// Computed colors serialize as a function (rgb(), rgba(), color(), oklch()),
// a hex literal, or a bare keyword. No nested parentheses in any of those.
const COLOR_RE = /^(?:[a-z][a-z0-9-]*\([^()]*\)|#[0-9a-f]{3,8}|[a-z]+)$/i;

interface ParsedShadow {
  offsetX: string;
  offsetY: string;
  blur: string;
  color: string;
  // Rough visual weight, used only to pick between layers of one list.
  weight: number;
}

// Splits a box-shadow list on top-level commas (commas inside rgb()/rgba()/
// color functions don't separate shadows).
function splitShadowList(boxShadow: string): string[] {
  const shadows: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of boxShadow) {
    if (char === '(') depth++;
    // Clamped at 0 so a stray ')' can't drive depth negative and silently
    // stop top-level commas from splitting the rest of the list.
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      shadows.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) shadows.push(current.trim());
  return shadows;
}

// Parses one shadow, or returns null when it can't be represented: inset, too
// few lengths, an unrecognized token, a negative blur (invalid in a filter),
// or a shadow with no offset and no blur, which would paint entirely behind
// the opaque triangle and so is worse than keeping the default arrow shadow.
//
// Computed style puts the color first ("rgba(0, 0, 0, 0.1) 0px 2px 4px 0px");
// authored order (color last) is tolerated too. Lengths appear in source
// order: offset-x, offset-y, blur, spread.
function parseShadow(shadow: string): ParsedShadow | null {
  const tokens = shadow.match(/[a-zA-Z][a-zA-Z0-9-]*\([^)]*\)|\S+/g) ?? [];
  if (tokens.length === 0) return null;

  const lengths: string[] = [];
  const colorParts: string[] = [];
  for (const token of tokens) {
    if (token.toLowerCase() === 'inset') return null;
    if (LENGTH_RE.test(token)) {
      lengths.push(token);
    } else if (COLOR_RE.test(token)) {
      colorParts.push(token);
    } else {
      // Unrecognized token: refuse the whole shadow rather than emit it.
      return null;
    }
  }
  if (lengths.length < 2 || colorParts.length > 1) return null;

  const [offsetX, offsetY, blur = '0'] = lengths;
  const blurValue = parseFloat(blur);
  if (blurValue < 0) return null;

  const weight = Math.abs(parseFloat(offsetX)) + Math.abs(parseFloat(offsetY)) + blurValue;
  if (weight === 0) return null;

  return { offsetX, offsetY, blur, color: colorParts[0] ?? '', weight };
}

// Returns a filter value approximating the given computed box-shadow list, or
// null when nothing representable remains (empty, "none", inset-only, or only
// shadows that would paint nothing). Callers must treat null as "leave the
// custom property unset" so the template's default arrow shadow still applies.
export function boxShadowToDropShadowFilter(boxShadow: string | null | undefined): string | null {
  if (!boxShadow || boxShadow === 'none') return null;

  const parsed = splitShadowList(boxShadow)
    .map(parseShadow)
    .filter((shadow): shadow is ParsedShadow => shadow !== null);
  if (parsed.length === 0) return null;

  const strongest = parsed.reduce((best, shadow) => (shadow.weight > best.weight ? shadow : best));
  const parts = [strongest.offsetX, strongest.offsetY, strongest.blur];
  if (strongest.color) parts.push(strongest.color);
  return `drop-shadow(${parts.join(' ')})`;
}

// A custom property that is set but yields an invalid declaration is invalid
// at computed-value time: filter resets to its initial value and the var()
// fallback is NOT consulted, so an unparseable value would remove the arrow
// shadow entirely rather than fall back. Verified in Chrome. Callers check
// here before writing. Where CSS.supports is unavailable (older browsers,
// jsdom) the structural validation above is the only gate.
export function isSupportedArrowShadow(filter: string): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return true;
  try {
    return CSS.supports('filter', filter);
  } catch {
    return true;
  }
}
