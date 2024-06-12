import { shouldPersistSession } from "./local-storage";

const params = new URLSearchParams(window.location.search);
const previewParamId = "cioPreviewId";

export function setupPreview() {
    const cioPreviewId = fetchPreviewId();
    if (cioPreviewId) {
        shouldPersistSession(false);
        return true;
    }
    return false;
}

export function fetchPreviewId() {
    return params.get(previewParamId);
}
