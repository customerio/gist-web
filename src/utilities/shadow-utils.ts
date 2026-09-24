// Converts the message's computed box-shadow, reported by the renderer, into
// the drop-shadow() filter the tooltip container uses. src/templates/tooltip.ts
// explains why the tooltip's shadow is a filter rather than a box-shadow.
//
// The input is always a *computed* value, which the browser normalises to
// "<color> <x>px <y>px <blur>px <spread>px [inset]". That is what lets this be
// one regex per layer instead of a tokenizer, and what makes the output valid
// by construction, so the caller writes it straight to a custom property.
//
// drop-shadow() has no spread and no inset equivalent, so those are dropped and
// skipped. Only the strongest layer is emitted: filter functions compose
// sequentially, so chaining drop-shadow() would cast the second from the
// already-shadowed result and compound.
//
// Mirrored in ES5 by customerio/parcel at
// app/src/pages/embed/cio/in-app/components/tooltip-indicator.tsx.

// Colour first is what every browser we have checked serialises; accepting it
// last as well means a differing order degrades to working rather than to no
// shadow at all.
const COMPUTED_LAYER = /^(.*?)(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(.*)$/;

// One function, hex literal or keyword — never several tokens, never nested
// parentheses. A colour that doesn't match means the layer was misread, and
// echoing it could close drop-shadow() early and turn the rest into a second
// filter function.
const COMPUTED_COLOR =
  /^(?:(?:rgba?|hsla?|hwb|lab|lch|oklch|oklab|color|color-mix|light-dark)\([^()]*\)|#[0-9a-f]{3,8}|[a-z]+)$/i;

const INSET_LAYER = /(^|\s)inset(\s|$)/;

function splitTopLevelLayers(boxShadow: string): string[] {
  // Commas inside rgb()/color() separate channels, not layers. Depth is clamped
  // so a stray ')' can't stop the rest of the list from splitting.
  const layers: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of boxShadow) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      layers.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  layers.push(current);
  return layers;
}

// Null when nothing representable remains, which the caller must treat as
// "leave the custom property unset" so the template's default still applies.
export function boxShadowToDropShadowFilter(boxShadow: string | null | undefined): string | null {
  if (!boxShadow || boxShadow === 'none') return null;

  let strongest: { visibleExtent: number; filter: string } | null = null;

  for (const layer of splitTopLevelLayers(boxShadow)) {
    if (INSET_LAYER.test(layer)) continue;

    const match = COMPUTED_LAYER.exec(layer.trim());
    if (!match) continue;

    const [, beforeLengths, offsetX, offsetY, blur, , afterLengths] = match;
    const color = (beforeLengths.trim() || afterLengths.trim()).trim();
    if (!COMPUTED_COLOR.test(color)) continue;

    const blurPx = parseFloat(blur);
    if (blurPx < 0) continue;

    // Zero extent paints entirely behind the opaque tooltip, so the template
    // default is better than emitting it.
    const visibleExtent = Math.abs(parseFloat(offsetX)) + Math.abs(parseFloat(offsetY)) + blurPx;
    if (!Number.isFinite(visibleExtent) || visibleExtent === 0) continue;

    if (!strongest || visibleExtent > strongest.visibleExtent) {
      strongest = {
        visibleExtent,
        filter: `drop-shadow(${offsetX}px ${offsetY}px ${blur}px ${color})`,
      };
    }
  }

  return strongest ? strongest.filter : null;
}
