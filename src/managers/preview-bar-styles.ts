const CHEVRON_PATH =
  'M3.54223 5.33301L7.7089 9.33301L11.8756 5.33301L12.6121 6.04011L7.7089 10.7472L2.80566 6.04011L3.54223 5.33301Z';

export function chevronSvg(fill: string): string {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="${CHEVRON_PATH}" fill="${fill}"/></svg>`;
}

function chevronDataUri(fill: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(chevronSvg(fill))}")`;
}

export const PREVIEW_BAR_CSS = `
  #gist-preview-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    z-index: 99999999999;
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: none;
  }
  .gist-pb-toggle-row {
    display: flex; justify-content: center;
    padding: 6px 16px;
    border-bottom: 1px solid #e5e7eb;
  }
  .gist-pb-toggle-row--collapsed { border-bottom: none; }
  .gist-pb-toggle-btn {
    background: #08272B; border: none;
    padding: 4px 14px;
    border-radius: 100px;
    font-size: 12px; font-weight: 500;
    font-family: system-ui, -apple-system, sans-serif;
    color: white; cursor: pointer;
    display: flex; align-items: center; gap: 6px;
    pointer-events: auto;
  }
  .gist-pb-controls-row {
    background: #F8F9F9;
    box-shadow: 1px 2px 2px #34344605, 3px 3px 8px #34344614;
    display: flex; flex-wrap: wrap; align-items: center;
    gap: 12px; padding: 10px 16px 12px;
    pointer-events: auto;
  }
  .gist-pb-label-group { display: flex; flex-direction: column; gap: 4px; }
  .gist-pb-label-group--grow { flex: 1; }
  .gist-pb-label {
    font-size: 10px; font-weight: 600; color: #3F4E50;
    letter-spacing: 0.05em; text-transform: uppercase;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .gist-pb-select {
    height: 32px; padding: 0 32px 0 8px;
    border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    background: white ${chevronDataUri('#3F4E50')} no-repeat right 2px center;
    color: #3F4E50; cursor: pointer; outline: none;
    appearance: none; min-width: 120px;
  }
  .gist-pb-input {
    height: 32px; padding: 0 8px;
    border: 1px solid #d1d5db; border-radius: 6px;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    color: #3F4E50; outline: none; box-sizing: border-box;
  }
  .gist-pb-checkbox-row { display: flex; align-items: center; gap: 6px; height: 32px; }
  .gist-pb-checkbox-label {
    font-size: 12px; font-family: system-ui, -apple-system, sans-serif;
    color: #3F4E50; cursor: pointer; user-select: none;
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
    font-size: 13px; font-family: monospace; color: #3F4E50;
    min-width: 0; background: transparent;
  }
  .gist-pb-color-opacity {
    width: 36px; border: none; border-left: 1px solid #d1d5db;
    outline: none; padding: 0 4px;
    font-size: 13px; font-family: system-ui, -apple-system, sans-serif;
    color: #3F4E50; background: transparent; text-align: right;
  }
  .gist-pb-color-pct {
    font-size: 12px; color: #3F4E50; padding: 0 6px 0 2px;
    font-family: system-ui, -apple-system, sans-serif; flex-shrink: 0;
  }
  .gist-pb-inline-row { display: flex; align-items: center; gap: 6px; }
  .gist-pb-select-elem-btn {
    height: 32px; padding: 0 12px;
    border: none; border-radius: 6px;
    font-size: 12px; font-weight: 500; font-family: system-ui, -apple-system, sans-serif;
    background: #08272B; color: white; cursor: pointer; white-space: nowrap; flex-shrink: 0;
  }
  .gist-pb-spacer { flex: 1; min-width: 0; }
  .gist-pb-save-btn {
    height: 36px; padding: 0 18px;
    background: #08272B; color: white;
    border: none; border-radius: 6px;
    font-size: 13px; font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer; white-space: nowrap; align-self: center;
  }
  .gist-pb-save-btn:disabled {
    background: #CAD6D8; cursor: not-allowed;
  }
  .gist-pb-picker-overlay {
    position: fixed; inset: 0; z-index: 999999999998; cursor: crosshair;
  }
  .gist-pb-checkbox { cursor: pointer; width: 14px; height: 14px; }
  .gist-pb-pick-highlight { outline: 2px solid #006FF5 !important; }
  .gist-pb-pick-error { outline: 2px solid #941616 !important; }
  #gist-preview-bar.gist-pb-hidden { display: none; }
  .gist-pb-ended-row {
    justify-content: center; align-items: center; gap: 10px; padding: 12px 16px;
    flex-wrap: nowrap;
  }
  .gist-pb-ended-icon {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 50%;
    background: #08272B; color: white;
    font-size: 13px; font-weight: 700; flex-shrink: 0;
  }
  .gist-pb-ended-text {
    margin: 0; font-size: 13px; color: #3F4E50;
    font-family: system-ui, -apple-system, sans-serif;
    min-width: 0;
  }
  .gist-pb-ended-text strong { color: #08272B; }
  @media (max-width: 1024px) {
    .gist-pb-controls-row { gap: 8px; }
    .gist-pb-label-group { flex: 1 1 100%; }
    .gist-pb-label-group--grow { flex: 1 1 100%; }
    .gist-pb-select { width: 100%; min-width: unset; box-sizing: border-box; }
    .gist-pb-input { width: 100% !important; box-sizing: border-box; }
    .gist-pb-color-control { width: 100%; }
    .gist-pb-checkbox-row { width: 100%; }
    .gist-pb-inline-row { flex-direction: row; align-items: center; }
    .gist-pb-inline-row .gist-pb-input { flex: 1; min-width: 0; }
    .gist-pb-save-btn { width: 100%; box-sizing: border-box; }
    .gist-pb-label--spacer { display: none; }
  }
`;
