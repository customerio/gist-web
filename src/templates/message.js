export function messageHTMLTemplate(elementId, messageProperties, url) {
    var maxWidthBreakpoint = 600;
    if (messageProperties.messageWidth > maxWidthBreakpoint) {
      maxWidthBreakpoint = messageProperties.messageWidth;    
    }
    var template = `
    <div id="gist-embed-message">
        <style>
            #gist-overlay.gist-background {
                position: fixed;
                z-index: 9999999998;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: ${messageProperties.overlayColor};
                visibility: hidden;
            }
            #gist-overlay.gist-background.gist-visible {
                visibility: visible;
            }
            .gist-message {
                width: ${messageProperties.messageWidth}px;
                position: absolute;
                border: none;
                opacity: 0;
                transition: opacity 0.3s ease-in-out, height 0.1s ease-in-out;
                z-index: 9999999999;
                left: 50%;
                transform: translateX(-50%);
            }
            .gist-message.gist-visible {
                opacity: 1;
                pointer-events: auto;
            }
            .gist-message.gist-center {
                transform: translate(-50%, -50%);
                top: 50%;
            }
            .gist-message.gist-bottom {
                bottom: 0;
            }
            .gist-message.gist-top {
                top: 0;
            }
            @media (max-width: ${maxWidthBreakpoint}px) {
                .gist-message {
                    width: 100%;
                }
            }
        </style>
        <div id="gist-overlay" class="gist-background">
            <iframe id="${elementId}" class="gist-message" src="${url}"></iframe>
        </div>
    </div>`;
    return template;
}