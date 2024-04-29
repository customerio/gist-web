export function embedHTMLTemplate(elementId, messageProperties, url) {
    var maxWidthBreakpoint = 800;
    if (messageProperties.messageWidth > maxWidthBreakpoint) {
        maxWidthBreakpoint = messageProperties.messageWidth;
    }
    var template = `
    <div id="gist-embed">
        <style>
            #x-gist-floating-top, #x-gist-floating-top-left, #x-gist-floating-top-right {
                position: fixed;
                top: 0px;
                z-index: 1000000;
            }
            #x-gist-floating-bottom, #x-gist-floating-bottom-left, #x-gist-floating-bottom-right {
                position: fixed;
                bottom: 0px;
                z-index: 1000000;
            }
            #x-gist-bottom, #x-gist-top, #x-gist-floating-top, #x-gist-floating-bottom {
                left: 50%;
                transform: translate(-50%, 0%);
            }
            #x-gist-floating-top-right, #x-gist-floating-bottom-right {
                right: 0px;
            }
            #gist-embed {
                position: relative;
                height: 100%;
                width: 100%;
            }
            #gist-embed-container {
                position: relative;
                height: 100%;
                width: 100%;
            }
            #gist-embed-container .gist-frame {
                height: 100%;
                width: 100%;
                border: none;
            }
            @media (max-width: ${maxWidthBreakpoint}px) {
                #x-gist-top.${elementId},
                #x-gist-bottom.${elementId},
                #x-gist-floating-top.${elementId},
                #x-gist-floating-bottom.${elementId},
                #x-gist-floating-top-left.${elementId},
                #x-gist-floating-top-right.${elementId},
                #x-gist-floating-bottom-left.${elementId},
                #x-gist-floating-bottom-right.${elementId} {
                    width: 100% !important;
                }
            }
        </style>
        <div id="gist-embed-container">
            <iframe id="${elementId}" class="gist-frame" src="${url}"></iframe>
        </div>
    </div>`;
    return template
}