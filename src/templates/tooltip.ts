import type { ResolvedMessageProperties } from '../types';

export const ARROW_SIZE = 10;

// The tooltip's shadow is drawn once, on the container holding both the iframe
// and the arrow, as a filter: drop-shadow() follows the rendered alpha, so it
// traces message and arrow as one silhouette — the message's real rounded
// corners included. A box-shadow would only trace the container's rectangle,
// and shadowing the arrow separately leaves a seam where its base meets the
// frame.
//
// It also escapes the iframe. Shadows don't affect layout, so the frame is
// sized to the message's layout box and the message's own shadow was clipped
// into a hard rectangular edge. For tooltips the renderer now reports its
// shadow and stops painting it (messageBackgroundChanged); the variable below
// carries it, falling back to a default that keeps a shadowless tooltip
// visible against a page it matches.
const DEFAULT_TOOLTIP_SHADOW = 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.08))';

// The container's box is the iframe: the message's layout box, margin included.
// The renderer reports how far the painted box sits inside it (sizeChanged) so
// the arrow touches the message instead of floating a margin away — which the
// single silhouette depends on, since a detached arrow traces as a second
// shadowed shape.
const PAINTED_INSET_TOP = 'var(--gist-tooltip-inset-top, 0px)';
const PAINTED_INSET_RIGHT = 'var(--gist-tooltip-inset-right, 0px)';
const PAINTED_INSET_BOTTOM = 'var(--gist-tooltip-inset-bottom, 0px)';
const PAINTED_INSET_LEFT = 'var(--gist-tooltip-inset-left, 0px)';

// An asymmetric margin moves the painted centre off the container's.
const PAINTED_CENTRE_X = `calc(50% + (${PAINTED_INSET_LEFT} - ${PAINTED_INSET_RIGHT}) / 2)`;
const PAINTED_CENTRE_Y = `calc(50% + (${PAINTED_INSET_TOP} - ${PAINTED_INSET_BOTTOM}) / 2)`;

function getArrowClass(tooltipPosition: string): string {
  switch (tooltipPosition) {
    case 'top':
      return 'gist-arrow-bottom';
    case 'bottom':
      return 'gist-arrow-top';
    case 'left':
      return 'gist-arrow-right';
    case 'right':
      return 'gist-arrow-left';
    default:
      return 'gist-arrow-bottom';
  }
}

export function tooltipHTMLTemplate(
  elementId: string,
  messageProperties: ResolvedMessageProperties,
  url: string,
  wrapperId: string = '',
  colorSchemeCss: string = 'light only'
): string {
  let maxWidthBreakpoint = 600;
  if (messageProperties.messageWidth > maxWidthBreakpoint) {
    maxWidthBreakpoint = messageProperties.messageWidth;
  }

  const arrowColor = messageProperties.tooltipArrowColor;
  const arrowClass = getArrowClass(messageProperties.tooltipPosition);
  const scope = wrapperId ? `#${wrapperId} ` : '';

  const template = `
    <div class="gist-tooltip-outer">
        <style>
            ${scope}.gist-tooltip-outer {
                position: absolute;
            }
            ${scope}.gist-tooltip-container {
                position: relative;
                z-index: 9999999;
                opacity: 0;
                transition: opacity 0.3s ease-in-out;
                filter: var(--gist-tooltip-shadow, ${DEFAULT_TOOLTIP_SHADOW});
            }
            ${scope}.gist-tooltip-container.gist-visible {
                opacity: 1;
            }
            ${scope}.gist-tooltip-frame-clip {
                overflow: hidden;
            }
            ${scope}.gist-tooltip-frame {
                display: block;
                width: ${messageProperties.messageWidth}px;
                border: none;
                transition: height 0.1s ease-in-out;
                color-scheme: ${colorSchemeCss};
            }
            ${scope}.gist-tooltip-arrow {
                width: 0;
                height: 0;
                position: absolute;
                z-index: 1;
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-bottom {
                bottom: ${PAINTED_INSET_BOTTOM};
                left: ${PAINTED_CENTRE_X};
                transform: translateX(-50%) translateY(100%);
                border-left: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid transparent;
                border-top: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-color, ${arrowColor});
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-top {
                top: ${PAINTED_INSET_TOP};
                left: ${PAINTED_CENTRE_X};
                transform: translateX(-50%) translateY(-100%);
                border-left: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-color, ${arrowColor});
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-right {
                right: ${PAINTED_INSET_RIGHT};
                top: ${PAINTED_CENTRE_Y};
                transform: translateY(-50%) translateX(100%);
                border-top: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid transparent;
                border-left: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-color, ${arrowColor});
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-left {
                left: ${PAINTED_INSET_LEFT};
                top: ${PAINTED_CENTRE_Y};
                transform: translateY(-50%) translateX(-100%);
                border-top: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-color, ${arrowColor});
            }
            @media (max-width: ${maxWidthBreakpoint}px) {
                ${scope}.gist-tooltip-frame {
                    max-width: 100%;
                }
            }
        </style>
        <div class="gist-tooltip-container">
            <div class="gist-tooltip-arrow ${arrowClass}"></div>
            <div class="gist-tooltip-frame-clip">
                <iframe id="${elementId}" class="gist-tooltip-frame" src="${url}"></iframe>
            </div>
        </div>
    </div>`;
  return template;
}
