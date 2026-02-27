import Gist from '../gist';
import { log } from './log';
import { shouldPersistSession, isSessionBeingPersisted } from './local-storage';
import { initPreviewBar } from '../managers/preview-bar-manager';

const previewParamId = "cioPreviewId";

export function setupPreview() {
    const cioPreviewId = fetchPreviewId();
    if (cioPreviewId) {
        shouldPersistSession(false);
        Gist.setUserToken(cioPreviewId);
        log(`Preview mode enabled with user token: ${cioPreviewId}`);
        initPreviewBar();
    }
    return !isSessionBeingPersisted();
}

function fetchPreviewId() {
    const params = new URLSearchParams(window.location.search);
    return params.get(previewParamId);
}
