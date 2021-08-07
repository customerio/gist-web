export function resolveMessageProperies(message) {
    var elementId = "";
    var routeRule = "";
    var position = "";
    var isEmbedded = false;
    var hasRouteRule = false;
    var hasPosition = false;
    var shouldScale = false;

    if (message.properties && message.properties.gist) {
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
    }
    return {
        isEmbedded: isEmbedded,
        elementId: elementId,
        hasRouteRule: hasRouteRule,
        routeRule: routeRule,
        position: position,
        hasPosition: hasPosition,
        shouldScale: shouldScale
    }
}