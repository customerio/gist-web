export const PREVIEW_BAR_CSS = `
  #gist-preview-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: white;
    border-top: 1px solid #e5e7eb;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.08);
    z-index: 99999999999;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .gist-pb-toggle-row {
    display: flex; justify-content: flex-end;
    padding: 4px 16px 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  .gist-pb-toggle-row--collapsed { border-bottom: none; padding-bottom: 4px; }
  .gist-pb-toggle-btn {
    background: none; border: none; padding: 0;
    font-size: 12px; font-family: system-ui, -apple-system, sans-serif;
    color: #6b7280; cursor: pointer;
    display: flex; align-items: center; gap: 4px;
  }
  .gist-pb-controls-row {
    display: flex; flex-wrap: wrap; align-items: flex-end;
    gap: 12px; padding: 10px 16px 12px;
  }
  .gist-pb-label-group { display: flex; flex-direction: column; gap: 4px; }
  .gist-pb-label {
    font-size: 10px; font-weight: 600; color: #9ca3af;
    letter-spacing: 0.05em; text-transform: uppercase;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .gist-pb-select {
    height: 32px; padding: 0 24px 0 8px;
    border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    background: white; color: #111827; cursor: pointer; outline: none;
    appearance: auto; min-width: 120px;
  }
  .gist-pb-input {
    height: 32px; padding: 0 8px;
    border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    color: #111827; outline: none; box-sizing: border-box;
  }
  .gist-pb-checkbox-row { display: flex; align-items: center; gap: 6px; padding-top: 14px; }
  .gist-pb-checkbox-label {
    font-size: 12px; font-family: system-ui, -apple-system, sans-serif;
    color: #374151; cursor: pointer; user-select: none;
  }
  .gist-pb-color-control {
    display: flex; align-items: center;
    border: 1px solid #d1d5db; border-radius: 6px;
    overflow: hidden; height: 32px; background: white;
  }
  .gist-pb-color-swatch {
    width: 28px; height: 100%;
    cursor: pointer; flex-shrink: 0;
    border-right: 1px solid #d1d5db; position: relative;
  }
  .gist-pb-color-input {
    position: absolute; opacity: 0; width: 0; height: 0; pointer-events: none;
  }
  .gist-pb-color-hex {
    flex: 1; border: none; outline: none; padding: 0 6px;
    font-size: 13px; font-family: monospace; color: #111827;
    min-width: 0; background: transparent;
  }
  .gist-pb-color-opacity {
    width: 36px; border: none; border-left: 1px solid #d1d5db;
    outline: none; padding: 0 4px;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    color: #111827; background: transparent; text-align: right;
  }
  .gist-pb-color-pct {
    font-size: 12px; color: #6b7280; padding: 0 6px 0 2px;
    font-family: system-ui, -apple-system, sans-serif; flex-shrink: 0;
  }
  .gist-pb-inline-row { display: flex; align-items: center; gap: 6px; }
  .gist-pb-select-elem-btn {
    height: 32px; padding: 0 10px;
    border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 12px; font-family: system-ui, -apple-system, sans-serif;
    background: white; color: #374151; cursor: pointer; white-space: nowrap;
  }
  .gist-pb-spacer { flex: 1; }
  .gist-pb-save-btn {
    height: 36px; padding: 0 18px;
    background: #0d9488; color: white;
    border: none; border-radius: 6px;
    font-size: 13px; font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer; white-space: nowrap; align-self: flex-end;
  }
  .gist-pb-picker-overlay {
    position: fixed; inset: 0; z-index: 999999999998; cursor: crosshair;
  }
  .gist-pb-checkbox { cursor: pointer; width: 14px; height: 14px; }
  .gist-pb-pick-highlight { outline: 2px solid #3b82f6 !important; }
`;
