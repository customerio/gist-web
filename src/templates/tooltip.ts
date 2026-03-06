import type { ResolvedMessageProperties } from '../types';

const ARROW_SIZE = 10;

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
  url: string
): string {
  let maxWidthBreakpoint = 600;
  if (messageProperties.messageWidth > maxWidthBreakpoint) {
    maxWidthBreakpoint = messageProperties.messageWidth;
  }

  const arrowColor = messageProperties.tooltipArrowColor;
  const arrowClass = getArrowClass(messageProperties.tooltipPosition);

  const template = `
    <div id="gist-tooltip">
        <style>
            #gist-tooltip {
                position: absolute;
            }
            #gist-tooltip-container {
                position: relative;
                z-index: 9999999;
            }
            .gist-tooltip-frame {
                width: ${messageProperties.messageWidth}px;
                border: none;
                opacity: 0;
                transition: opacity 0.3s ease-in-out, height 0.1s ease-in-out;
            }
            .gist-tooltip-frame.gist-visible {
                opacity: 1;
                pointer-events: auto;
            }
            .gist-tooltip-arrow {
                width: 0;
                height: 0;
                position: absolute;
            }
            .gist-tooltip-arrow.gist-arrow-bottom {
                bottom: -${ARROW_SIZE}px;
                left: 50%;
                transform: translateX(-50%);
                border-left: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid transparent;
                border-top: ${ARROW_SIZE}px solid ${arrowColor};
            }
            .gist-tooltip-arrow.gist-arrow-top {
                top: -${ARROW_SIZE}px;
                left: 50%;
                transform: translateX(-50%);
                border-left: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid ${arrowColor};
            }
            .gist-tooltip-arrow.gist-arrow-right {
                right: -${ARROW_SIZE}px;
                top: 50%;
                transform: translateY(-50%);
                border-top: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid transparent;
                border-left: ${ARROW_SIZE}px solid ${arrowColor};
            }
            .gist-tooltip-arrow.gist-arrow-left {
                left: -${ARROW_SIZE}px;
                top: 50%;
                transform: translateY(-50%);
                border-top: ${ARROW_SIZE}px solid transparent;
                border-bottom: ${ARROW_SIZE}px solid transparent;
                border-right: ${ARROW_SIZE}px solid ${arrowColor};
            }
            @media (max-width: ${maxWidthBreakpoint}px) {
                .gist-tooltip-frame {
                    max-width: 100%;
                }
            }
        </style>
        <div id="gist-tooltip-container">
            <div class="gist-tooltip-arrow ${arrowClass}"></div>
            <iframe id="${elementId}" class="gist-tooltip-frame" src="${url}"></iframe>
        </div>
    </div>`;
  return template;
}
