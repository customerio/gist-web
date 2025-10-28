export function livePreviewControlBarTemplate() {
    return `
    <div id="gist-live-preview-bar">
        <style>
            #gist-live-preview-bar {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                background: #F8F9F9;
                color: #3F4E50;
                padding: 20px 30px;
                box-shadow: 0 -2px 10px rgba(0,0,0,0.15);
                z-index: 10000000000;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                font-size: 14px;
                transition: all 0.3s ease;
            }
            #gist-live-preview-bar.minimized {
                bottom: 20px;
                left: auto;
                right: 20px;
                width: auto;
                padding: 0;
                border-radius: 50%;
                border: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            #gist-live-preview-bar.minimized .gist-preview-controls-wrapper {
                display: none;
            }
            #gist-live-preview-bar.minimized .gist-preview-logo-btn {
                display: flex;
                border-radius: 50%;
                width: 64px;
                height: 64px;
            }
            #gist-live-preview-bar.minimized .gist-preview-logo-btn svg {
                width: 64px;
                height: 64px;
            }
            #gist-live-preview-bar.minimized .gist-preview-minimize-icon {
                display: none;
            }
            .gist-preview-controls-wrapper {
                display: flex;
                gap: 15px;
                align-items: center;
                flex-wrap: nowrap;
            }
            .gist-preview-logo-btn {
                background: #0C373D;
                color: #FFFFFF;
                border: none;
                padding: 12px;
                cursor: pointer;
                transition: all 0.2s;
                align-items: center;
                justify-content: center;
                width: 64px;
                height: 64px;
                display: none;
            }
            .gist-preview-logo-btn:hover {
                background: #0e4148;
            }
            .gist-preview-logo-btn svg {
                width: 72px;
                height: 72px;
                color: #FFFFFF;
            }
            .gist-preview-minimize-icon {
                position: absolute;
                top: -4px;
                right: -14px;
                background: transparent;
                border: none;
                cursor: pointer;
                padding: 8px;
                line-height: 1;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .gist-preview-minimize-icon:hover {
                opacity: 0.7;
            }
            .gist-preview-minimize-icon svg {
                width: 15px;
                height: 9px;
            }
            #gist-live-preview-bar label {
                display: inline-block;
                margin: 0;
                font-weight: 500;
                font-size: 12px;
                color: #3F4E50;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            #gist-live-preview-bar select,
            #gist-live-preview-bar input[type="text"],
            #gist-live-preview-bar input[type="color"] {
                padding: 8px 12px;
                border: 1px solid #08272B;
                border-radius: 4px;
                background: #FFFFFF;
                color: #3F4E50;
                font-size: 14px;
                box-sizing: border-box;
                width: auto;
            }
            #gist-live-preview-bar select {
                min-width: 140px;
            }
            #gist-live-preview-bar input[type="text"] {
                width: 100px;
            }
            #gist-live-preview-bar select:focus,
            #gist-live-preview-bar input[type="text"]:focus,
            #gist-live-preview-bar input[type="color"]:focus {
                outline: none;
                border-color: #0C373D;
            }
            #gist-live-preview-bar input[type="color"] {
                height: 38px;
                width: 60px;
                padding: 4px;
                cursor: pointer;
            }
            #gist-live-preview-bar button {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s;
                white-space: nowrap;
            }
            #gist-live-preview-bar .gist-preview-control-group {
                display: flex;
                align-items: center;
                gap: 8px;
                white-space: nowrap;
            }
            #gist-live-preview-bar .gist-preview-control-group label {
                margin: 0;
                display: inline;
            }
            #gist-live-preview-bar .gist-preview-control-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            #gist-live-preview-bar .gist-preview-control-row .gist-preview-control-group {
                flex: 0 0 auto;
            }
            .gist-preview-actions {
                margin-left: auto;
                display: flex;
                align-items: center;
            }
            #gist-live-preview-bar .gist-preview-save-btn {
                background: #08272B;
                color: #FFFFFF;
            }
            #gist-live-preview-bar .gist-preview-save-btn:hover {
                background: #0C373D;
            }
            #gist-live-preview-bar .gist-preview-select-target-btn {
                background: #08272B;
                color: #FFFFFF;
                padding: 8px 16px;
            }
            #gist-live-preview-bar .gist-preview-select-target-btn:hover {
                background: #0C373D;
            }
            #gist-live-preview-bar .gist-preview-select-target-btn.active {
                background: #e74c3c;
            }
            #gist-live-preview-bar .gist-preview-hidden {
                display: none !important;
            }
        </style>
        
        <button class="gist-preview-logo-btn" id="gist-preview-logo-btn">
            <svg width="auto" height="auto" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.74288 17.3002L-0.52832 20.5584V27.05H6.03928L9.33562 23.7918L12.6068 20.5584L6.03928 14.042L2.74288 17.3002Z" fill="currentColor"></path><path d="M9.33562 4.29241L6.03928 1.05908H-0.52832V7.55064L2.74288 10.8087L6.03928 14.0421L12.6068 7.55064L9.33562 4.29241Z" fill="currentColor"></path><path d="M19.1996 1.05908H12.6069V7.55064L19.1996 14.0421L12.6069 20.5585V27.0501H19.1996L25.7672 20.5585V7.55064L19.1996 1.05908Z" fill="currentColor"></path></svg>
        </button>
        
        <button class="gist-preview-minimize-icon" id="gist-preview-minimize-icon">
            <svg width="15" height="9" viewBox="0 0 15 9" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M1.10485 0L7.35485 6L13.6049 0L14.7097 1.06066L7.35485 8.12132L0 1.06066L1.10485 0Z" fill="#3F4E50"/>
            </svg>
        </button>
        
        <div class="gist-preview-controls-wrapper">
            <div class="gist-preview-control-group">
                <label for="gist-preview-display-type">Display Type</label>
                <select id="gist-preview-display-type">
                    <option value="modal">Modal</option>
                    <option value="overlay">Overlay</option>
                    <option value="inline">Inline</option>
                    <option value="tooltip">Tooltip</option>
                </select>
            </div>
            
            <div class="gist-preview-control-group gist-preview-modal-controls">
                <label for="gist-preview-modal-position">Position</label>
                <select id="gist-preview-modal-position">
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                </select>
            </div>
            
            <div class="gist-preview-control-group gist-preview-overlay-controls gist-preview-hidden">
                <label for="gist-preview-overlay-position">Position</label>
                <select id="gist-preview-overlay-position">
                    <option value="top-center">Top Center</option>
                    <option value="top-left">Top Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom-center">Bottom Center</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="bottom-right">Bottom Right</option>
                </select>
            </div>
            
            <div class="gist-preview-control-group gist-preview-modal-controls gist-preview-overlay-controls">
                <label for="gist-preview-message-width">Message Width</label>
                <input type="text" id="gist-preview-message-width" placeholder="414">
            </div>
            
            <div class="gist-preview-control-group gist-preview-modal-controls">
                <label for="gist-preview-overlay-color">Color</label>
                <input type="color" id="gist-preview-overlay-color" value="#000000">
            </div>
            
            <div class="gist-preview-control-group gist-preview-modal-controls">
                <label for="gist-preview-overlay-opacity">Opacity</label>
                <input type="text" id="gist-preview-overlay-opacity" placeholder="33" value="33" maxlength="2" style="width: 70px;">
            </div>
            
            <div class="gist-preview-control-group gist-preview-inline-controls gist-preview-hidden">
                <label for="gist-preview-element-id">Element ID</label>
                <input type="text" id="gist-preview-element-id" placeholder="element-id" style="width: 150px;">
                <button class="gist-preview-select-target-btn" id="gist-preview-select-target">Select</button>
            </div>
            
            <div class="gist-preview-control-group gist-preview-tooltip-controls gist-preview-hidden">
                <label for="gist-preview-tooltip-element-id">Element ID</label>
                <input type="text" id="gist-preview-tooltip-element-id" placeholder="element-id" style="width: 150px;">
                <button class="gist-preview-select-target-btn" id="gist-preview-select-target-tooltip">Select</button>
            </div>
            
            <div class="gist-preview-control-group gist-preview-tooltip-controls gist-preview-hidden">
                <label for="gist-preview-tooltip-position">Tooltip Position</label>
                <select id="gist-preview-tooltip-position">
                    <option value="top-left">Top Left</option>
                    <option value="top-center">Top Center</option>
                    <option value="top-right">Top Right</option>
                    <option value="bottom">Bottom</option>
                </select>
            </div>
            
            <div class="gist-preview-actions">
                <button class="gist-preview-save-btn" id="gist-preview-save-changes">Save Changes</button>
            </div>
        </div>
    </div>
    `;
}

