import { logOrganizationEvent } from "../services/analytics-service";
import { log } from "../utilities/log";

export const GIST_LOADED = "gist_loaded";
export const GIST_DISMISSED = "gist_dismissed";
export const GIST_SYSTEM_ACTION = "gist_system_action";
export const GIST_ACTION = "gist_action";

export async function logEvent(name, message) {
    log(`Logging analytics event ${name} for route: ${message.currentRoute}, instance id: ${message.instanceId}, queue id: ${message.queueId}`);
    await logOrganizationEvent(name, message.currentRoute, message.instanceId, message.queueId);
}