import Gist from '../gist';
import { log } from './log';
import {
  shouldPersistSession,
  isSessionBeingPersisted,
  clearSessionPersistenceFlag,
} from './local-storage';
import { clearUserToken } from '../managers/user-manager';
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

export function teardownPreview(): void {
  // Clear the preview token from sessionStorage while getStorage() still points there,
  // then reset the persistence flag so the next page load uses localStorage.
  clearUserToken();
  clearSessionPersistenceFlag();
}
