import { setupDebugOverlay } from './utilities/debug-mode';
if (typeof window !== 'undefined') setupDebugOverlay(); // fallback for when initialization fails

export { default } from './gist';
export type { GistConfig, GistEnv, GistMessage, DisplaySettings, MessageProperties } from './types';
