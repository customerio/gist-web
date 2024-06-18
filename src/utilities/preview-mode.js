import Gist from '../gist';
import { log } from './log';
import { shouldPersistSession, isSessionBeingPersisted } from './local-storage';

const previewParamId = "cioPreviewId";

export function setupPreview() {
    const cioPreviewId = fetchPreviewId();
    if (cioPreviewId) {
        shouldPersistSession(false);
        Gist.setUserToken(cioPreviewId);
        log(`Preview mode enabled with user token: ${cioPreviewId}`);
    }
    return !isSessionBeingPersisted();
}

function fetchPreviewId() {
    const params = new URLSearchParams(window.location.search);
    return params.get(previewParamId);
}
