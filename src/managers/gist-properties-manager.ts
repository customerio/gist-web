import type { DisplaySettings, GistMessage, ResolvedMessageProperties } from '../types';

export const MESSAGE_PROPERTY_DEFAULTS: ResolvedMessageProperties = {
  isEmbedded: false,
  elementId: '',
  hasRouteRule: false,
  routeRule: '',
  position: '',
  hasPosition: false,
  tooltipPosition: '',
  hasTooltipPosition: false,
  tooltipArrowColor: '#fff',
  shouldScale: false,
  campaignId: null,
  messageWidth: 414,
  overlayColor: '#00000033',
  persistent: false,
  exitClick: false,
  hasCustomWidth: false,
};

export function resolveMessageProperties(message: GistMessage): ResolvedMessageProperties {
  const defaults = MESSAGE_PROPERTY_DEFAULTS;

  const gist = message?.properties?.gist;
  if (!gist) return defaults;

  let tooltipArrowColor = gist.tooltipArrowColor;
  if (!tooltipArrowColor && message.displaySettings && Array.isArray(message.displaySettings)) {
    // Try to match savedStepName, otherwise use first step
    const stepName = message.savedStepName;
    let step = null;
    if (stepName) {
      step = message.displaySettings.find(
        (s: Record<string, string | DisplaySettings>) =>
          s && s.stepName === stepName && s.displaySettings
      );
    } else if (message.displaySettings.length > 0) {
      step = message.displaySettings[0];
    }
    if (step && step.displaySettings && step.displaySettings.tooltipArrowColor) {
      tooltipArrowColor = step.displaySettings.tooltipArrowColor;
    }
  }

  return {
    isEmbedded: !!gist.elementId && !gist.tooltipPosition,
    elementId: gist.elementId || '',
    hasRouteRule: !!gist.routeRuleWeb,
    routeRule: gist.routeRuleWeb || '',
    position: gist.position || '',
    hasPosition: !!gist.position,
    tooltipPosition: gist.tooltipPosition || '',
    hasTooltipPosition: !!gist.tooltipPosition,
    tooltipArrowColor: tooltipArrowColor || defaults.tooltipArrowColor,
    shouldScale: !!gist.scale,
    campaignId: gist.campaignId ?? null,
    messageWidth:
      gist.messageWidth != null && gist.messageWidth > 0
        ? gist.messageWidth
        : defaults.messageWidth,
    hasCustomWidth: (gist.messageWidth ?? 0) > 0,
    overlayColor: gist.overlayColor || defaults.overlayColor,
    persistent: !!gist.persistent,
    exitClick: !!gist.exitClick,
  };
}
