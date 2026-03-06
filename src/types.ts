export type GistEnv = 'prod' | 'dev' | 'local';

export interface GistConfig {
  siteId: string;
  dataCenter?: string;
  env?: GistEnv;
  logging?: boolean;
  experiments?: boolean;
  useAnonymousSession?: boolean;
  isPreviewSession?: boolean;
}

export interface GistMessage {
  messageId: string;
  queueId?: string;
  instanceId?: string;
  overlay?: boolean;
  elementId?: string | null;
  tooltipPosition?: string;
  firstLoad?: boolean;
  shouldScale?: boolean;
  shouldResizeHeight?: boolean;
  renderStartTime?: number;
  currentRoute?: string;
  position?: string | null;
  savedStepName?: string | null;
  isDisplayChange?: boolean;
  displaySettings?: DisplaySettings;
  properties?: MessageProperties;
}

export interface DisplaySettings {
  displayType?: 'modal' | 'overlay' | 'inline' | 'tooltip';
  modalPosition?: string;
  overlayPosition?: string;
  elementSelector?: string;
  tooltipPosition?: string;
  maxWidth?: number;
  overlayColor?: string;
  dismissOutsideClick?: boolean;
}

export interface StepDisplayConfig {
  stepName: string;
  displaySettings: DisplaySettings;
}

export interface MessageProperties {
  gist?: GistProperties;
  [key: string]: unknown;
}

export interface GistProperties {
  elementId?: string | null;
  position?: string | null;
  messageWidth?: number;
  overlayColor?: string;
  exitClick?: boolean;
  tooltipPosition?: string;
  routeRuleWeb?: string;
  scale?: boolean;
  campaignId?: string | null;
  persistent?: boolean;
  [key: string]: unknown;
}

export interface ResolvedMessageProperties {
  isEmbedded: boolean;
  elementId: string;
  hasRouteRule: boolean;
  routeRule: string;
  position: string;
  hasPosition: boolean;
  tooltipPosition: string;
  hasTooltipPosition: boolean;
  shouldScale: boolean;
  campaignId: string | null;
  messageWidth: number;
  overlayColor: string;
  persistent: boolean;
  exitClick: boolean;
  hasCustomWidth: boolean;
}
