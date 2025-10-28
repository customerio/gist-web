import Gist from '../gist';
import { log } from './log';
import { shouldPersistSession } from './local-storage';

const livePreviewParamId = "cioSessionId";

export function setupLivePreview() {
    const cioSessionId = fetchSessionId();
    if (cioSessionId) {
        shouldPersistSession(false);
        log(`Live preview mode enabled with session ID: ${cioSessionId}`);
        return cioSessionId;
    }
    return null;
}

function fetchSessionId() {
    const params = new URLSearchParams(window.location.search);
    return params.get(livePreviewParamId);
}

