import Gist from '../gist';
import { log } from './log';
import {
  shouldPersistSession,
  isSessionBeingPersisted,
  clearSessionPersistenceFlag,
} from './local-storage';
import { clearUserToken, getUserToken } from '../managers/user-manager';
import { initPreviewBar, setPreviewBarInitialStep } from '../managers/preview-bar-manager';

export const PREVIEW_PARAM_ID = 'cioPreviewId';
export const PREVIEW_SETTINGS_PARAM = 'cioPreviewSettings';

export function setupPreview(): boolean {
  const params = new URLSearchParams(window.location.search);
  const cioPreviewId = params.get(PREVIEW_PARAM_ID);
  if (cioPreviewId) {
    shouldPersistSession(false);
    Gist.setUserToken(cioPreviewId);
    log(`Preview mode enabled with user token: ${cioPreviewId}`);
    initPreviewBar();

    const settingsParam = params.get(PREVIEW_SETTINGS_PARAM);
    if (settingsParam) {
      try {
        const decoded = JSON.parse(atob(settingsParam));
        const stepName = decoded.stepName || null;
        const displayType = decoded.displayType || null;
        if (stepName || displayType) {
          setPreviewBarInitialStep(stepName, displayType);
        }
      } catch {
        log('Preview bar: failed to parse cioPreviewSettings');
      }
    }
  }
  return !isSessionBeingPersisted();
}

/**
 * Rewrites a navigation target so the preview session survives the hop:
 * setupPreview() on the destination page re-bootstraps the preview bar and the
 * preview user token from these params. Without them a cross-page step change
 * would strand the tab in a headless preview session — sessionStorage keeps the
 * preview token alive, but the bar (and its exit affordance) only initializes
 * from the URL (INAPP-14575).
 */
export function withPreviewSession(url: string, stepName?: string, displayType?: string): string {
  try {
    const destination = new URL(url, window.location.href);
    const previewToken = getUserToken();
    if (!previewToken) {
      return url;
    }
    destination.searchParams.set(PREVIEW_PARAM_ID, previewToken);
    try {
      destination.searchParams.set(
        PREVIEW_SETTINGS_PARAM,
        btoa(JSON.stringify({ stepName, displayType }))
      );
    } catch {
      // btoa rejects non-Latin1 step names; the queue's saved step state still
      // opens the right step on the destination page, the bar just won't be
      // pre-seeded with it.
    }
    return destination.href;
  } catch {
    return url;
  }
}

export function teardownPreview(): void {
  // Clear the preview token from sessionStorage while getStorage() still points there,
  // then reset the persistence flag so the next page load uses localStorage.
  clearUserToken();
  clearSessionPersistenceFlag();
}
