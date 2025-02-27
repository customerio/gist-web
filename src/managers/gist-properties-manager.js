export function resolveMessageProperties(message) {
    const defaults = {
        isEmbedded: false,
        elementId: "",
        hasRouteRule: false,
        routeRule: "",
        position: "",
        hasPosition: false,
        shouldScale: false,
        campaignId: null,
        messageWidth: 414,
        overlayColor: "#00000033",
        persistent: false,
        exitClick: false,
        hasCustomWidth: false
    };

    const gist = message?.properties?.gist;
    if (!gist) return defaults;

    return {
        isEmbedded: !!gist.elementId,
        elementId: gist.elementId || "",
        hasRouteRule: !!gist.routeRuleWeb,
        routeRule: gist.routeRuleWeb || "",
        position: gist.position || "",
        hasPosition: !!gist.position,
        shouldScale: !!gist.scale,
        campaignId: gist.campaignId ?? null,
        messageWidth: gist.messageWidth > 0 ? gist.messageWidth : defaults.messageWidth,
        hasCustomWidth: gist.messageWidth > 0,
        overlayColor: gist.overlayColor || defaults.overlayColor,
        persistent: !!gist.persistent,
        exitClick: !!gist.exitClick
    };
}