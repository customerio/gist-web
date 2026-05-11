import { initDebugOverlay } from '../managers/debug-overlay-manager';
import { log } from './log';

export const DEBUG_SESSION_PARAM = 'cio_debug_session';

export function setupDebugOverlay(): void {
  if (typeof window === 'undefined') return;
  if (new URLSearchParams(window.location.search).get(DEBUG_SESSION_PARAM) !== 'true') return;

  try {
    initDebugOverlay();
  } catch (error) {
    // Fail silently if the debug overlay fails to initialize, as it should not impact the main functionality of the SDK
    log(`Failed to initialize debug overlay: ${error}`);
  }
}
