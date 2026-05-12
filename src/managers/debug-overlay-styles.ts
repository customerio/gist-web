export const DEBUG_OVERLAY_CSS = `
  #gist-debug-overlay {
    position: fixed; bottom: 16px; right: 16px;
    z-index: 99999999999;
    background: #08272B; color: white;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 11px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    width: 300px;
    max-height: min(700px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    pointer-events: auto;
    overflow: hidden;
  }
  .gist-debug-header {
    display: flex; align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    flex-shrink: 0;
  }
  .gist-debug-title {
    flex: 1;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  #gist-debug-overlay-close {
    background: none; border: none;
    color: white; cursor: pointer;
    padding: 0; font-size: 18px; line-height: 1;
    opacity: 0.6; flex-shrink: 0;
    font-family: system-ui, -apple-system, sans-serif;
    -webkit-appearance: none; appearance: none;
  }
  #gist-debug-overlay-close:hover { opacity: 1; }
  .gist-debug-section {
    padding: 0 12px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    overflow-y: auto;
    max-height: 180px;
  }
  .gist-debug-section:last-child { border-bottom: none; }
  .gist-debug-label {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #08272B;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255,255,255,0.45);
    padding: 8px 0 5px;
    font-weight: 600;
  }
  .gist-debug-value {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: 11px;
    color: rgba(255,255,255,0.9);
    overflow-wrap: break-word;
  }
  .gist-debug-msg {
    background: rgba(255,255,255,0.06);
    border-radius: 4px;
    padding: 5px 7px;
    margin-bottom: 8px;
  }
  .gist-debug-msg:last-child { margin-bottom: 0; }
  .gist-debug-msg-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }
  .gist-debug-msg-row:last-child { margin-bottom: 0; }
  .gist-debug-msg-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 4px;
  }
  .gist-debug-msg-state {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
  }
  .gist-debug-msg-state--active {
    color: #4caf82;
    background: rgba(76,175,130,0.12);
  }
  .gist-debug-msg-state--queued {
    color: rgba(255,200,100,0.9);
    background: rgba(255,200,100,0.1);
  }
  .gist-debug-msg-dismiss {
    margin-left: auto;
    background: none;
    border: none;
    color: rgba(255,255,255,0.3);
    cursor: pointer;
    padding: 0;
    font-size: 13px;
    line-height: 1;
    font-family: system-ui, -apple-system, sans-serif;
    -webkit-appearance: none;
    appearance: none;
  }
  .gist-debug-msg-dismiss:hover { color: rgba(255,255,255,0.7); }
  .gist-debug-element-found {
    color: #4caf82;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .gist-debug-route-mismatch {
    color: #ff6b6b;
    font-size: 9px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .gist-debug-msg-type {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255,255,255,0.45);
    background: rgba(255,255,255,0.08);
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
  }
  .gist-debug-msg-key {
    color: rgba(255,255,255,0.45);
    font-size: 10px;
    line-height: 1.4;
    min-width: 64px;
    flex-shrink: 0;
  }
  .gist-debug-msg-val {
    font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    font-size: 10px;
    line-height: 1.4;
    color: rgba(255,255,255,0.9);
    overflow-wrap: break-word;
  }
  .gist-debug-val-error {
    color: #ff6b6b;
    font-weight: 600;
  }
  .gist-debug-expand-detail {
    background: rgba(255,107,107,0.08);
    border-left: 2px solid rgba(255,107,107,0.4);
    color: rgba(255,255,255,0.75);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 10px;
    padding: 4px 6px;
    margin-top: 4px;
    margin-bottom: 6px;
    border-radius: 0 3px 3px 0;
  }
  .gist-debug-expand-list {
    margin: 0;
    padding: 0 0 0 14px;
    list-style: disc;
  }
  .gist-debug-expand-list li {
    margin-bottom: 3px;
    line-height: 1.4;
  }
  .gist-debug-expand-list li:last-child { margin-bottom: 0; }
  .gist-debug-msg-details {
    margin: 5px 0 0;
    padding: 0 0 0 14px;
    list-style: disc;
    color: rgba(255,255,255,0.5);
    font-size: 10px;
    line-height: 1.4;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .gist-debug-msg-details li { margin-bottom: 2px; }
  .gist-debug-msg-details li:last-child { margin-bottom: 0; }
`;
