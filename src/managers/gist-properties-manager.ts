import { log } from '../utilities/log';
import type {
  EmbedFrequency,
  GistMessage,
  ResolvedMessageProperties,
  StepDisplayConfig,
} from '../types';

const EMBED_FREQUENCIES: readonly EmbedFrequency[] = ['always', 'untilDismissed', 'onceEver'];

// An embed payload is untyped JSON from the host page, so a frequency TypeScript
// never saw has to be caught here rather than falling through to the default in
// silence.
function resolveEmbedFrequency(value: unknown, fallback: EmbedFrequency): EmbedFrequency {
  if (value === undefined) return fallback;
  if (EMBED_FREQUENCIES.includes(value as EmbedFrequency)) return value as EmbedFrequency;
  log(`Unknown embed frequency "${String(value)}", falling back to "${fallback}".`);
  return fallback;
}

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
  isEmbed: false,
  embedFrequency: 'always',
  embedReshowAfterMinutes: 0,
  embedLogView: false,
};

function resolveReshowAfterMinutes(value: unknown): number {
  const minutes = Math.floor(Number(value));
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function resolveMessageTooltipColor(message: GistMessage): string {
  let tooltipColor = MESSAGE_PROPERTY_DEFAULTS.tooltipArrowColor;

  if ((message?.properties?.gist?.tooltipArrowColor?.length ?? 0) > 0) {
    tooltipColor = message!.properties!.gist!.tooltipArrowColor!;
  } else {
    if (!Array.isArray(message?.displaySettings) || message.displaySettings.length === 0) {
      return tooltipColor;
    }

    // Try to match savedStepName, otherwise use first step
    let step: StepDisplayConfig = message.displaySettings[0];
    if (message.savedStepName) {
      const matchedStep = message.displaySettings.find(
        (s: StepDisplayConfig) => s?.stepName === message.savedStepName && s.displaySettings
      );
      if (matchedStep) {
        step = matchedStep;
      }
    }

    if (step?.displaySettings?.tooltipArrowColor) {
      tooltipColor = step.displaySettings.tooltipArrowColor;
    }
  }

  return tooltipColor;
}

export function resolveMessageProperties(message: GistMessage): ResolvedMessageProperties {
  const defaults = MESSAGE_PROPERTY_DEFAULTS;

  const gist = message?.properties?.gist;
  // isEmbed is driven by the message, not by properties.gist.embed: an embed
  // that takes every display default still has to resolve as one.
  const isEmbed = !!message?.embedId;
  if (!gist) return { ...defaults, isEmbed };

  const embed = gist.embed;

  return {
    isEmbedded: !!gist.elementId && !gist.tooltipPosition,
    elementId: gist.elementId || '',
    hasRouteRule: !!gist.routeRuleWeb,
    routeRule: gist.routeRuleWeb || '',
    position: gist.position || '',
    hasPosition: !!gist.position,
    tooltipPosition: gist.tooltipPosition || '',
    hasTooltipPosition: !!gist.tooltipPosition,
    tooltipArrowColor: resolveMessageTooltipColor(message),
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
    isEmbed,
    embedFrequency: resolveEmbedFrequency(embed?.frequency, defaults.embedFrequency),
    embedReshowAfterMinutes: resolveReshowAfterMinutes(embed?.reshowAfterMinutes),
    embedLogView: !!embed?.logView,
  };
}
