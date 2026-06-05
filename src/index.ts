import { setupDebugOverlay } from './utilities/debug-mode';
if (typeof window !== 'undefined') setupDebugOverlay();

export { default } from './gist';
export type {
  ColorScheme,
  GistConfig,
  GistEnv,
  GistMessage,
  DisplaySettings,
  MessageProperties,
} from './types';
