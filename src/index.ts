import Gist from './gist';
import { setupDebugOverlay } from './utilities/debug-mode';

type LoadedWindow = typeof window & { __gistWebLoaded?: boolean; Gist?: typeof Gist };

// The copy of the SDK that loads first wins (matching <jist-template>
// registration): on a duplicate evaluation this bundle exports the live
// instance instead of its own fresh class. window.Gist still points at the
// first copy while this factory runs — the UMD wrapper only assigns the
// export after the module graph finishes — so re-exporting it makes the
// second <script> a no-op rather than an orphan factory: customer calls to
// window.Gist.setup() keep hitting the already-initialized instance, and no
// second polling loop or SSE connection starts. If no prior instance is on
// the window (e.g. an npm-bundled copy loaded first and never set the UMD
// global), fall back to this bundle's own class.
let exported = Gist;

if (typeof window !== 'undefined') {
  const w = window as LoadedWindow;
  if (w.__gistWebLoaded) {
    // Deliberately not the debug-gated log(): a duplicate SDK embed is a
    // page misconfiguration that support needs to see on customer pages.
    console.warn(
      'Gist: the SDK has been loaded more than once on this page; check for duplicate snippets or bundles.'
    );
    if (w.Gist) {
      exported = w.Gist;
    }
  } else {
    w.__gistWebLoaded = true;
    setupDebugOverlay();
  }
}

export default exported;
export type {
  ColorScheme,
  GistConfig,
  GistEnv,
  GistMessage,
  DisplaySettings,
  MessageProperties,
  EmbedFrequency,
  EmbedDisplayConfig,
  EmbedPayload,
} from './types';
