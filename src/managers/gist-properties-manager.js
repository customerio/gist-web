export function resolveMessageProperies(message) {
    var elementId = "";
    var routeRule = "";
    var position = "";
    var isEmbedded = false;
    var hasRouteRule = false;
    var hasPosition = false;
    var shouldScale = false;
    var campaignId = null;
    var persistent = false;
    var overlayColor = "#00000033";
    var maxWidth = 414;

    if (message.properties && message.properties.gist) {
        if (message.properties.gist.campaignId) {
            campaignId = message.properties.gist.campaignId;
        }
        if (message.properties.gist.elementId) {
            elementId = message.properties.gist.elementId;
            isEmbedded = true;
        }
        if (message.properties.gist.routeRuleWeb) {
            routeRule = message.properties.gist.routeRuleWeb;
            hasRouteRule = true;
        }
        if (message.properties.gist.position) {
            position = message.properties.gist.position;
            hasPosition = true;
        }
        if (message.properties.gist.scale) {
            shouldScale = message.properties.gist.scale;
        }
        if (message.properties.gist.overlayColor) {
            overlayColor = message.properties.gist.overlayColor;
        }
        if (message.properties.gist.maxWidth && message.properties.gist.maxWidth > 0) {
            maxWidth = message.properties.gist.maxWidth;
        }
        if (message.properties.gist.persistent)
        {
            persistent = true
        }
    }
    return {
        isEmbedded: isEmbedded,
        elementId: elementId,
        hasRouteRule: hasRouteRule,
        routeRule: routeRule,
        position: position,
        hasPosition: hasPosition,
        shouldScale: shouldScale,
        campaignId: campaignId,
        maxWidth: maxWidth,
        overlayColor: overlayColor,
        persistent: persistent
    }
}