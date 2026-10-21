import type { ResolvedMessageProperties } from '../types';

export const ARROW_SIZE = 10;

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
  const lightArrowFill = `var(--gist-tooltip-arrow-color, ${arrowColor})`;
  const darkArrowFill = `var(--gist-tooltip-arrow-color-dark, ${lightArrowFill})`;

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
                /* One shadow around the frame and arrow; none while unset. */
                filter: drop-shadow(var(--gist-tooltip-shadow));
                --gist-tooltip-arrow-fill: ${lightArrowFill};
            }
            /* Follows the container's color-scheme, the scheme the message renders in. */
            @supports (color: light-dark(#000, #fff)) {
                ${scope}.gist-tooltip-container {
                    --gist-tooltip-arrow-fill: light-dark(${lightArrowFill}, ${darkArrowFill});
                }
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
                bottom: 0;
                left: 50%;
                transform: translateX(-50%) translateY(100%);
                border-left: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid transparent;
                border-top: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-fill);
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-top {
                top: 0;
                left: 50%;
                transform: translateX(-50%) translateY(-100%);
                border-left: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-fill);
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-right {
                right: 0;
                top: 50%;
                transform: translateY(-50%) translateX(100%);
                border-top: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid transparent;
                border-left: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-fill);
            }
            ${scope}.gist-tooltip-arrow.gist-arrow-left {
                left: 0;
                top: 50%;
                transform: translateY(-50%) translateX(-100%);
                border-top: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid var(--gist-tooltip-arrow-fill);
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
