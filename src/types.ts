export type GistEnv = 'prod' | 'dev' | 'local';

export type ColorScheme = 'default' | 'auto' | 'system';

export interface GistConfig {
  siteId: string;
  /**
   * Renderer-only mode for embedded messages: the SDK renders messages handed
   * to it directly (Gist.embed) and starts none of the delivery machinery — no
   * user queue, SSE, guest session, inbox or preview session. Set by hosts that
   * only place embeds (e.g. a landing page snippet), never by a workspace that
   * also receives queue-delivered in-app messages on the same page.
   */
  embedOnly?: boolean;
  dataCenter?: string;
  env?: GistEnv;
  logging?: boolean;
  experiments?: boolean;
  useAnonymousSession?: boolean;
  isPreviewSession?: boolean;
  colorScheme?: ColorScheme;
}

export interface GistMessage {
  messageId: string;
  queueId?: string;
  /**
   * Set when the message was placed by Gist.embed rather than delivered
   * through the queue. Identifies the embed for frequency state and reporting,
   * and marks the message as pinned inside its host element.
   */
  embedId?: string;
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
  tooltipArrowColor?: string;
  maxWidth?: number;
  overlayColor?: string;
  dismissOutsideClick?: boolean;
  /**
   * Page the step belongs to (product tours). Saved with the step state so a
   * restored step is only re-shown on its own page (INAPP-14575).
   */
  pageUrl?: string;
}

export interface StepDisplayConfig {
  stepName: string;
  displaySettings: DisplaySettings;
}

/**
 * How often an embedded message renders. One dimension rather than several
 * booleans, so no combination can contradict itself.
 *
 * - `always` — render on every page load; closing hides it for that load only.
 *   Writes nothing to storage.
 * - `untilDismissed` — once closed, stay hidden (see `reshowAfterMinutes`).
 * - `onceEver` — render once per browser, then never again.
 * - `oncePerSession` — render once per tab session.
 */
export type EmbedFrequency = 'always' | 'untilDismissed' | 'onceEver' | 'oncePerSession';

export interface EmbedDisplayConfig {
  frequency?: EmbedFrequency;
  /**
   * With `untilDismissed`, re-show this long after a close instead of never.
   * Zero or absent means the dismissal is permanent.
   */
  reshowAfterMinutes?: number;
  /**
   * Log the view to the Gist consumer API. Off by default: an embed has no
   * queue entry, and reporting is owned by the analytics layer above the SDK.
   */
  logView?: boolean;
}

/**
 * The snippet-shaped input accepted by Gist.embed — the message payload plus
 * everything needed to place and gate it. Also the JSON contract of a
 * `<script type="application/json" data-cio-embed>` block on the host page.
 */
export interface EmbedPayload {
  v?: number;
  embedId: string;
  /** Element to render into. Defaults to `[data-cio-embed="<embedId>"]`. */
  target?: string;
  siteId?: string;
  display?: EmbedDisplayConfig;
  message: GistMessage;
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
  tooltipArrowColor?: string;
  routeRuleWeb?: string;
  scale?: boolean;
  campaignId?: string | null;
  persistent?: boolean;
  embed?: EmbedDisplayConfig;
  [key: string]: unknown;
}

export interface TextStyle {
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  color: string;
  lineHeight: number;
}

export interface BoxShadow {
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
}

export interface InboxFloatingIcon {
  background: string;
  color: string;
  svg: string;
}

export interface InboxUnreadIndicator {
  showAlert: boolean;
  text: TextStyle;
  background: string;
}

export interface InboxPattern {
  floatingIcon: InboxFloatingIcon;
  background: string;
  cornerRadius: number;
  borderColor: string;
  dividerColor: string;
  shadow: BoxShadow;
  position: string;
  hoverBackground: string;
  unreadIndicator: InboxUnreadIndicator;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface Branding {
  theme: unknown;
  patterns: {
    inbox: InboxPattern;
    modes?: {
      dark?: {
        inbox?: DeepPartial<InboxPattern>;
      };
    };
  };
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
  tooltipArrowColor: string;
  shouldScale: boolean;
  campaignId: string | null;
  messageWidth: number;
  overlayColor: string;
  persistent: boolean;
  exitClick: boolean;
  hasCustomWidth: boolean;
  isEmbed: boolean;
  embedFrequency: EmbedFrequency;
  embedReshowAfterMinutes: number;
  embedLogView: boolean;
}

export type InboxActionBehavior = 'openUrl' | 'dismiss' | 'openDeeplink' | 'performAction';

export interface InboxActionConfig {
  behavior: InboxActionBehavior;
  action?: string;
  name?: string;
  dismiss?: boolean;
  newTab?: boolean;
}
