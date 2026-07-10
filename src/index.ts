import { setupDebugOverlay } from './utilities/debug-mode';

if (typeof window !== 'undefined') {
  const w = window as typeof window & { __gistWebLoaded?: boolean };
  if (w.__gistWebLoaded) {
    // Deliberately not the debug-gated log(): a duplicate SDK embed is a
    // page misconfiguration that support needs to see on customer pages.
    console.warn(
      'Gist: the SDK has been loaded more than once on this page; check for duplicate snippets or bundles.'
    );
  } else {
    w.__gistWebLoaded = true;
    setupDebugOverlay();
  }
}

export { default } from './gist';
export type {
  ColorScheme,
  GistConfig,
  GistEnv,
  GistMessage,
  DisplaySettings,
  MessageProperties,
} from './types';
