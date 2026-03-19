import Gist from '../gist';
import { DisplaySettings, GistMessage, StepDisplayConfig } from '../types';
import { applyMessageStepChange, hideMessageVisually } from './message-manager';
import { sendDisplaySettingsToIframe } from './message-component-manager';
import {
  hasDisplayChanged,
  wideOverlayPositions,
  mapOverlayPositionToElementId,
} from '../utilities/message-utils';
import { log } from '../utilities/log';
import { PREVIEW_BAR_CSS, chevronSvg } from './preview-bar-styles';
import { savePreviewDisplaySettings, deletePreviewSession } from '../services/preview-service';
import { PREVIEW_PARAM_ID } from '../utilities/preview-mode';

const STORAGE_KEY = 'gist.previewBar.collapsed';
const STYLE_ID = 'gist-pb-styles';
const BAR_ID = 'gist-preview-bar';

const OVERLAY_POSITION_LABELS: Record<string, string> = {
  topLeft: 'Top Left',
  topCenter: 'Top Center',
  topRight: 'Top Right',
  bottomLeft: 'Bottom Left',
  bottomCenter: 'Bottom Center',
  bottomRight: 'Bottom Right',
};

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = PREVIEW_BAR_CSS;
  document.head.appendChild(style);
}

// ─── Module state ─────────────────────────────────────────────────────────────

let currentInstanceId: string | null = null;
let currentSteps: StepDisplayConfig[] = [];
let currentSettings: DisplaySettings = {};
let currentStepName: string | null = null;
let isCollapsed = false;
let isSessionEnded = false;
let sessionEndedCountdown = 5;
let sessionEndedTimer: ReturnType<typeof setInterval> | null = null;
let pickerActive = false;
let pickerCleanup: (() => void) | null = null;
let pendingInitialStepName: string | null = null;
let pendingInitialDisplayType: string | null = null;
// Stores the original innerHTML of each element before the message first occupied it,
// keyed by CSS selector. Only captured once per selector so re-visits always restore
// to the true pre-message state.
const originalElementContent = new Map<string, string>();

// ─── DOM helper ───────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Partial<HTMLElementTagNameMap[K]> & { [k: string]: unknown } = {}
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    (element as Record<string, unknown>)[k] = v;
  }
  return element;
}

function labelGroup(labelText: string, control: HTMLElement): HTMLElement {
  const wrapper = el('div', { className: 'gist-pb-label-group' });
  wrapper.appendChild(el('span', { className: 'gist-pb-label', textContent: labelText }));
  wrapper.appendChild(control);
  return wrapper;
}

function createSelect(
  options: { value: string; label: string }[],
  selectedValue: string
): HTMLSelectElement {
  const select = el('select', { className: 'gist-pb-select' });
  for (const opt of options) {
    const o = el('option', { value: opt.value, textContent: opt.label });
    if (opt.value === selectedValue) o.selected = true;
    select.appendChild(o);
  }
  return select;
}

function createInput(type: string, value: string | number, width?: string): HTMLInputElement {
  const input = el('input', { className: 'gist-pb-input', type, value: String(value) });
  if (width) input.style.width = width;
  return input;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

function parseOverlayColor(hex: string): { color: string; opacity: number } {
  const clean = hex.replace('#', '');
  if (clean.length === 8) {
    return {
      color: '#' + clean.slice(0, 6).toUpperCase(),
      opacity: Math.round((parseInt(clean.slice(6), 16) / 255) * 100),
    };
  }
  if (clean.length === 6) return { color: '#' + clean.toUpperCase(), opacity: 100 };
  return { color: '#000000', opacity: 20 };
}

function buildOverlayColor(color: string, opacity: number): string {
  const alpha = Math.round((Math.min(100, Math.max(0, opacity)) / 100) * 255);
  return (
    '#' + color.replace('#', '').toUpperCase() + alpha.toString(16).padStart(2, '0').toUpperCase()
  );
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function isReadyToApply(settings: DisplaySettings): boolean {
  if (
    (settings.displayType === 'inline' || settings.displayType === 'tooltip') &&
    !settings.elementSelector?.trim()
  ) {
    return false;
  }
  return true;
}

// ─── Emit settings ────────────────────────────────────────────────────────────

function emitSettings(settings: DisplaySettings) {
  if (
    settings.displayType === 'overlay' &&
    wideOverlayPositions.includes(mapOverlayPositionToElementId(settings.overlayPosition))
  ) {
    const { maxWidth: _ignored, ...rest } = settings;
    settings = rest;
  }
  currentSettings = settings;
  // Update the step in the full displaySettings array (shared reference with message.displaySettings)
  if (currentStepName) {
    const idx = currentSteps.findIndex((s) => s.stepName === currentStepName);
    if (idx !== -1) {
      currentSteps[idx] = { ...currentSteps[idx], displaySettings: { ...settings } };
    }
  }
  if (!currentInstanceId) return;
  const message = Gist.currentMessages.find((m: GistMessage) => m.instanceId === currentInstanceId);
  if (message && isReadyToApply(settings)) {
    sendDisplaySettingsToIframe(message);
    if (hasDisplayChanged(message, settings)) {
      applyMessageStepChange(message, currentStepName, settings);
    }
  }
  persistDisplaySettings();
}

function persistDisplaySettings(): void {
  const params = new URLSearchParams(window.location.search);
  const cioPreviewId = params.get(PREVIEW_PARAM_ID);
  if (!cioPreviewId) return;
  savePreviewDisplaySettings(cioPreviewId, currentSteps)
    .then((response) => {
      if (response && response.status === 404 && currentInstanceId) {
        Gist.dismissMessage(currentInstanceId);
      }
    })
    .catch(() => log('Failed to persist preview display settings'));
}

// ─── Control builders ─────────────────────────────────────────────────────────

function buildModalControls(settings: DisplaySettings, row: HTMLElement) {
  const posSelect = createSelect(
    [
      { value: 'top', label: 'Top' },
      { value: 'center', label: 'Center' },
      { value: 'bottom', label: 'Bottom' },
    ],
    settings.modalPosition || 'center'
  );
  posSelect.addEventListener('change', () =>
    emitSettings({ ...currentSettings, modalPosition: posSelect.value })
  );
  row.appendChild(labelGroup('Position', posSelect));

  const maxWidthInput = createInput('number', settings.maxWidth ?? 414, '80px');
  maxWidthInput.addEventListener('change', () =>
    emitSettings({ ...currentSettings, maxWidth: parseInt(maxWidthInput.value) || 414 })
  );
  row.appendChild(labelGroup('Max Width', maxWidthInput));

  row.appendChild(buildOverlayColorControl(settings));

  const checkRow = el('div', { className: 'gist-pb-checkbox-row' });
  const checkbox = el('input', { className: 'gist-pb-checkbox', type: 'checkbox' });
  checkbox.checked = settings.dismissOutsideClick ?? false;
  const checkLabel = el('label', {
    className: 'gist-pb-checkbox-label',
    textContent: 'Dismiss on click outside',
  });

  const toggle = () => {
    checkbox.checked = !checkbox.checked;
    emitSettings({ ...currentSettings, dismissOutsideClick: checkbox.checked });
  };
  checkbox.addEventListener('change', () =>
    emitSettings({ ...currentSettings, dismissOutsideClick: checkbox.checked })
  );
  checkLabel.addEventListener('click', toggle);

  checkRow.appendChild(checkbox);
  checkRow.appendChild(checkLabel);
  const checkGroup = labelGroup('\u00a0', checkRow);
  checkGroup.classList.add('gist-pb-label-group--grow');
  (checkGroup.firstChild as HTMLElement).classList.add('gist-pb-label--spacer');
  row.appendChild(checkGroup);
}

function buildOverlayControls(settings: DisplaySettings, row: HTMLElement) {
  const posSelect = createSelect(
    Object.entries(OVERLAY_POSITION_LABELS).map(([value, label]) => ({ value, label })),
    settings.overlayPosition || 'topCenter'
  );
  posSelect.addEventListener('change', () =>
    emitSettings({ ...currentSettings, overlayPosition: posSelect.value })
  );
  row.appendChild(labelGroup('Position', posSelect));

  const isWidePosition = wideOverlayPositions.includes(
    mapOverlayPositionToElementId(settings.overlayPosition)
  );
  if (!isWidePosition) {
    const maxWidthInput = createInput('number', settings.maxWidth ?? 414, '80px');
    maxWidthInput.addEventListener('change', () =>
      emitSettings({ ...currentSettings, maxWidth: parseInt(maxWidthInput.value) || 414 })
    );
    row.appendChild(labelGroup('Max Width', maxWidthInput));
  }
}

function buildInlineControls(settings: DisplaySettings, row: HTMLElement) {
  const selectorInput = createInput('text', settings.elementSelector || '', '260px');
  selectorInput.placeholder = 'Element ID or selector';
  selectorInput.addEventListener('change', () => {
    const newSelector = selectorInput.value.trim();
    const prevSelector = currentSettings.elementSelector;
    if (newSelector) captureElementContent(newSelector);
    emitSettings({ ...currentSettings, elementSelector: newSelector });
    if (prevSelector && prevSelector !== newSelector) {
      restoreElementContent(prevSelector);
    }
  });

  const selectBtn = el('button', {
    className: 'gist-pb-select-elem-btn',
    textContent: 'Select Element',
  });
  selectBtn.addEventListener('click', () => startElementPicker(selectorInput));

  const inputRow = el('div', { className: 'gist-pb-inline-row' });
  inputRow.appendChild(selectorInput);
  inputRow.appendChild(selectBtn);
  row.appendChild(labelGroup('Element Selector', inputRow));
}

function buildOverlayColorControl(settings: DisplaySettings): HTMLElement {
  const { color, opacity } = parseOverlayColor(settings.overlayColor || '#00000033');

  const controlRow = el('div', { className: 'gist-pb-color-control' });

  const colorInput = el('input', { className: 'gist-pb-color-input', type: 'color', value: color });
  const swatch = el('div', { className: 'gist-pb-color-swatch' });
  swatch.style.background = color;
  swatch.appendChild(colorInput);
  swatch.addEventListener('click', () => colorInput.click());

  const hexInput = el('input', {
    className: 'gist-pb-color-hex',
    type: 'text',
    maxLength: 6,
    value: color.replace('#', ''),
  });
  const opacityInput = el('input', {
    className: 'gist-pb-color-opacity',
    type: 'number',
    min: '0',
    max: '100',
    value: String(opacity),
  });
  const pctLabel = el('span', { className: 'gist-pb-color-pct', textContent: '%' });

  const emitColor = () => {
    const hex = '#' + hexInput.value.replace('#', '');
    const pct = parseInt(opacityInput.value) || 0;
    swatch.style.background = hex;
    colorInput.value = hex;
    emitSettings({ ...currentSettings, overlayColor: buildOverlayColor(hex, pct) });
  };

  // Sync swatch/hex display while picker is open; emit only on dismiss
  colorInput.addEventListener('input', () => {
    hexInput.value = colorInput.value.replace('#', '').toUpperCase();
    swatch.style.background = colorInput.value;
  });
  colorInput.addEventListener('change', emitColor);
  hexInput.addEventListener('change', emitColor);
  opacityInput.addEventListener('change', emitColor);

  controlRow.appendChild(swatch);
  controlRow.appendChild(hexInput);
  controlRow.appendChild(opacityInput);
  controlRow.appendChild(pctLabel);

  return labelGroup('Overlay Color', controlRow);
}

// ─── Element content preservation ────────────────────────────────────────────

function fetchElementBySelector(selector: string): HTMLElement | null {
  if (!selector) return null;
  try {
    return (document.getElementById(selector) ??
      document.querySelector(selector)) as HTMLElement | null;
  } catch {
    return null;
  }
}

/** Snapshot an element's innerHTML the first time the picker targets it. */
function captureElementContent(selector: string): void {
  if (!selector || originalElementContent.has(selector)) return;
  const element = fetchElementBySelector(selector);
  if (element) {
    originalElementContent.set(selector, element.innerHTML);
  }
}

/** Restore the original innerHTML to an element the message previously occupied. */
function restoreElementContent(selector: string): void {
  const original = originalElementContent.get(selector);
  if (original === undefined) return;
  const element = fetchElementBySelector(selector);
  if (element) {
    element.innerHTML = original;
  }
}

/** Restore every captured element and clear the cache (call on session end). */
function restoreAllCapturedElements(): void {
  for (const selector of originalElementContent.keys()) {
    restoreElementContent(selector);
  }
  originalElementContent.clear();
}

// ─── Element picker ───────────────────────────────────────────────────────────

function buildUniqueSelector(element: HTMLElement): string | null {
  if (element.id) {
    const escaped = CSS.escape(element.id);
    if (document.querySelectorAll(`#${escaped}`).length === 1) return element.id;
  }

  const parts: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current.tagName !== 'BODY' && current.tagName !== 'HTML') {
    if (current.id) {
      const escaped = CSS.escape(current.id);
      if (document.querySelectorAll(`#${escaped}`).length === 1) {
        parts.unshift(`#${escaped}`);
        break;
      }
    }

    let part = current.tagName.toLowerCase();
    if (current.className && typeof current.className === 'string') {
      part += current.className
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((c) => `.${CSS.escape(c)}`)
        .join('');
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter((c) => c.tagName === current!.tagName);
      // Always include nth-of-type so each step is positionally unambiguous within its parent.
      const index = siblings.indexOf(current);
      part += `:nth-of-type(${index + 1})`;
    }

    parts.unshift(part);
    try {
      if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
    } catch {
      /* keep walking up */
    }

    current = current.parentElement;
  }

  const selector = parts.join(' > ');

  try {
    if (document.querySelectorAll(selector).length !== 1) {
      log(`buildUniqueSelector: could not produce a unique selector for element`);
      return null;
    }
  } catch {
    return null;
  }

  return selector;
}

function startElementPicker(target: HTMLInputElement) {
  if (pickerActive) return;
  pickerActive = true;

  const settingsBeforePicker = { ...currentSettings };
  const msg =
    Gist.currentMessages.find((m: GistMessage) => m.instanceId === currentInstanceId) ?? null;
  if (msg) hideMessageVisually(msg);
  // hideEmbedComponent ran synchronously above — restore the element's original content
  // so the page looks normal while the user is choosing a new target.
  if (currentSettings.elementSelector) {
    restoreElementContent(currentSettings.elementSelector);
  }

  const overlay = el('div', { className: 'gist-pb-picker-overlay' });
  let highlighted: HTMLElement | null = null;

  const onMove = (e: MouseEvent) => {
    overlay.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    overlay.style.pointerEvents = 'all';
    if (under && under !== highlighted && under !== overlay) {
      highlighted?.classList.remove('gist-pb-pick-highlight');
      highlighted = under;
      highlighted.classList.add('gist-pb-pick-highlight');
    }
  };

  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    cleanup();
    currentSettings = settingsBeforePicker;
    if (currentStepName) {
      const idx = currentSteps.findIndex((s) => s.stepName === currentStepName);
      if (idx !== -1)
        currentSteps[idx] = { ...currentSteps[idx], displaySettings: { ...settingsBeforePicker } };
    }
    if (msg && isReadyToApply(settingsBeforePicker))
      applyMessageStepChange(msg, currentStepName, settingsBeforePicker);
    renderBar();
  };

  const onClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    overlay.style.pointerEvents = 'none';
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    overlay.style.pointerEvents = 'all';
    if (under && under !== overlay) {
      // Remove the highlight class before building the selector — otherwise the transient
      // class name gets baked into the selector string and immediately becomes invalid.
      under.classList.remove('gist-pb-pick-highlight');
      const previewBar = document.getElementById(BAR_ID);
      const selector = previewBar?.contains(under) ? null : buildUniqueSelector(under);
      if (selector === null) {
        under.classList.add('gist-pb-pick-error');
        setTimeout(() => {
          under.classList.remove('gist-pb-pick-error');
          under.classList.add('gist-pb-pick-highlight');
        }, 800);
        return;
      }
      target.value = selector;
      // Snapshot the new element's content before the message occupies it.
      // captureElementContent is a no-op if we've seen this selector before,
      // so the map always holds the true pre-message state.
      captureElementContent(selector);
      const prevSelector = currentSettings.elementSelector;
      const updatedSettings = { ...currentSettings, elementSelector: selector };
      // emitSettings only reloads when hasDisplayChanged is true (i.e. the selector actually
      // changed). If the user re-selected the same element, hasDisplayChanged is false and
      // emitSettings won't reload — but the message was hidden when the picker opened, so we
      // need to reload it ourselves. Compute this before emitSettings can mutate the message.
      const reloadHandledByEmit =
        msg != null && isReadyToApply(updatedSettings) && hasDisplayChanged(msg, updatedSettings);
      emitSettings(updatedSettings);
      // hideEmbedComponent(prevSelector) ran synchronously inside emitSettings, so the old
      // element is now empty — safe to restore its original content.
      if (prevSelector && prevSelector !== selector) {
        restoreElementContent(prevSelector);
      }
      if (msg && !reloadHandledByEmit) {
        applyMessageStepChange(msg, currentStepName, updatedSettings);
      }
    }
    cleanup();
  };

  const cleanup = () => {
    highlighted?.classList.remove('gist-pb-pick-highlight');
    overlay.removeEventListener('mousemove', onMove);
    overlay.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onEsc);
    document.body.removeChild(overlay);
    pickerActive = false;
    pickerCleanup = null;
  };

  pickerCleanup = cleanup;
  overlay.addEventListener('mousemove', onMove);
  overlay.addEventListener('click', onClick);
  document.addEventListener('keydown', onEsc);
  document.body.appendChild(overlay);
}

function activatePickerIfNeeded(): void {
  const displayType = currentSettings.displayType;
  if (displayType !== 'inline' && displayType !== 'tooltip') return;
  const input = document.querySelector<HTMLInputElement>(
    "#gist-preview-bar .gist-pb-input[type='text']"
  );
  if (input) startElementPicker(input);
}

// ─── Bar rendering ────────────────────────────────────────────────────────────

function renderBar() {
  const bar = document.getElementById(BAR_ID);
  if (!bar) return;
  bar.classList.toggle('gist-pb-hidden', !currentInstanceId && !isSessionEnded);
  bar.innerHTML = '';
  if (!currentInstanceId) {
    if (isSessionEnded) {
      const endedRow = el('div', { className: 'gist-pb-controls-row gist-pb-ended-row' });
      const icon = el('span', { className: 'gist-pb-ended-icon', textContent: '✓' });
      const text = el('p', { className: 'gist-pb-ended-text' });
      text.innerHTML = `<strong>Preview session ended.</strong> Close this tab and navigate back to the message editor. Refreshing in ${sessionEndedCountdown}s\u2026`;
      endedRow.appendChild(icon);
      endedRow.appendChild(text);
      bar.appendChild(endedRow);
    }
    return;
  }

  const toggleRowClass = `gist-pb-toggle-row${isCollapsed ? ' gist-pb-toggle-row--collapsed' : ''}`;
  const toggleRow = el('div', { className: toggleRowClass });
  const toggleBtn = el('button', { className: 'gist-pb-toggle-btn' });
  const chevronStyle = isCollapsed
    ? 'transform:rotate(180deg);display:inline-flex;'
    : 'display:inline-flex;';
  toggleBtn.innerHTML = `${isCollapsed ? 'Expand' : 'Collapse'}<span style="${chevronStyle}">${chevronSvg('white')}</span>`;
  toggleBtn.addEventListener('click', toggleCollapse);
  toggleRow.appendChild(toggleBtn);
  bar.appendChild(toggleRow);

  if (isCollapsed) return;

  const controlsRow = el('div', { className: 'gist-pb-controls-row' });

  // Step dropdown
  if (currentSteps.length > 0) {
    const activeStepName = currentStepName ?? currentSteps[0].stepName;
    const stepSelect = createSelect(
      currentSteps.map((s) => ({ value: s.stepName, label: s.stepName })),
      activeStepName
    );
    stepSelect.addEventListener('change', () => {
      const step = currentSteps.find((s) => s.stepName === stepSelect.value);
      if (step) {
        currentStepName = step.stepName;
        currentSettings = { ...step.displaySettings };
        const msg = Gist.currentMessages.find(
          (m: GistMessage) => m.instanceId === currentInstanceId
        );
        if (msg && isReadyToApply(step.displaySettings)) {
          applyMessageStepChange(msg, step.stepName, step.displaySettings);
        }
        renderBar();
      }
    });
    controlsRow.appendChild(labelGroup('Step', stepSelect));
  }

  // Display type dropdown
  const displayTypeSelect = createSelect(
    [
      { value: 'modal', label: 'Modal' },
      { value: 'overlay', label: 'Overlay' },
      { value: 'inline', label: 'Inline' },
    ],
    currentSettings.displayType || 'modal'
  );
  displayTypeSelect.addEventListener('change', () => {
    const newType = displayTypeSelect.value as DisplaySettings['displayType'];
    const prevType = currentSettings.displayType;
    const prevSelector = currentSettings.elementSelector;
    const updated: DisplaySettings = { ...currentSettings, displayType: newType };
    if (newType === 'modal') {
      updated.modalPosition = updated.modalPosition || 'center';
      updated.maxWidth = updated.maxWidth ?? 414;
      delete updated.overlayPosition;
      delete updated.elementSelector;
    } else if (newType === 'overlay') {
      updated.overlayPosition = updated.overlayPosition || 'topCenter';
      updated.maxWidth = updated.maxWidth ?? 414;
      delete updated.modalPosition;
      delete updated.elementSelector;
    } else if (newType === 'inline') {
      delete updated.modalPosition;
      delete updated.overlayPosition;
    }
    currentSettings = updated;
    emitSettings(currentSettings);
    // Restore the element we just vacated when switching away from inline/tooltip.
    if (
      (prevType === 'inline' || prevType === 'tooltip') &&
      prevSelector &&
      newType !== 'inline' &&
      newType !== 'tooltip'
    ) {
      restoreElementContent(prevSelector);
    }
    renderBar();
  });
  controlsRow.appendChild(labelGroup('Display Type', displayTypeSelect));

  // Type-specific controls
  const displayType = currentSettings.displayType || 'modal';
  if (displayType === 'modal') buildModalControls(currentSettings, controlsRow);
  else if (displayType === 'overlay') buildOverlayControls(currentSettings, controlsRow);
  else if (displayType === 'inline') buildInlineControls(currentSettings, controlsRow);

  controlsRow.appendChild(el('div', { className: 'gist-pb-spacer' }));

  const endBtn = el('button', { className: 'gist-pb-save-btn', textContent: 'End session' });
  endBtn.addEventListener('click', async () => {
    if (!currentInstanceId) return;
    await Gist.dismissMessage(currentInstanceId);
  });
  controlsRow.appendChild(endBtn);

  bar.appendChild(controlsRow);
}

// ─── Collapse ─────────────────────────────────────────────────────────────────

function toggleCollapse() {
  isCollapsed = !isCollapsed;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(isCollapsed));
  } catch {
    /* ignore */
  }
  renderBar();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initPreviewBar(): void {
  if (document.getElementById(BAR_ID)) return;
  injectStyles();
  try {
    isCollapsed = sessionStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    isCollapsed = false;
  }
  const bar = el('div', { id: BAR_ID });
  document.body.appendChild(bar);
  renderBar();
}

export function updatePreviewBarMessage(message: GistMessage): void {
  isSessionEnded = false;
  currentInstanceId = message.instanceId ?? null;
  const fullSettings = message.displaySettings as unknown;
  if (Array.isArray(fullSettings) && fullSettings.length > 0) {
    currentSteps = fullSettings as StepDisplayConfig[];
    if (!currentStepName) {
      currentStepName = currentSteps[0].stepName;
      currentSettings = { ...currentSteps[0].displaySettings };
    }
  } else if (fullSettings && typeof fullSettings === 'object' && !Array.isArray(fullSettings)) {
    currentSettings = { ...(fullSettings as DisplaySettings) };
  }

  if (pendingInitialStepName || pendingInitialDisplayType) {
    const hasPendingStep = !!pendingInitialStepName;
    const hasPendingType = !!pendingInitialDisplayType;
    const savedStep = pendingInitialStepName;
    const savedType = pendingInitialDisplayType;
    pendingInitialStepName = null;
    pendingInitialDisplayType = null;

    if (hasPendingStep) {
      const targetStep = currentSteps.find((s) => s.stepName === savedStep);
      if (!targetStep) {
        log(`Preview bar: step "${savedStep}" not found, ignoring initial step/display override`);
        renderBar();
        return;
      }
      currentStepName = targetStep.stepName;
      currentSettings = { ...targetStep.displaySettings };
    }

    if (hasPendingType) {
      if (!hasPendingStep) {
        log(`Preview bar: display type "${savedType}" provided without a step, ignoring`);
        renderBar();
        return;
      }
      currentSettings = {
        ...currentSettings,
        displayType: savedType as DisplaySettings['displayType'],
      };
    }

    renderBar();

    const msg = Gist.currentMessages.find((m: GistMessage) => m.instanceId === currentInstanceId);
    if (msg && isReadyToApply(currentSettings)) {
      applyMessageStepChange(msg, currentStepName, currentSettings);
    } else {
      activatePickerIfNeeded();
    }
    return;
  }

  renderBar();
}

export function updatePreviewBarStep(stepName: string, displaySettings: DisplaySettings): void {
  currentStepName = stepName;
  const step = currentSteps.find((s) => s.stepName === stepName);

  if (step) {
    currentSettings = { ...step.displaySettings };
  } else if (displaySettings) {
    currentSettings = { ...displaySettings };
  }

  renderBar();
}

export function getPreviewBarStepSettings(stepName: string): DisplaySettings | null {
  const step = currentSteps.find((s) => s.stepName === stepName);
  return step ? { ...step.displaySettings } : null;
}

export function clearPreviewBarMessage(): void {
  // hideEmbedComponent was already called by the message manager before this runs,
  // so the occupied element is empty — safe to restore all original content now.
  restoreAllCapturedElements();
  currentInstanceId = null;
  currentSteps = [];
  currentSettings = {};
  currentStepName = null;
  isSessionEnded = true;
  sessionEndedCountdown = 5;

  const params = new URLSearchParams(window.location.search);
  const cioPreviewId = params.get(PREVIEW_PARAM_ID);
  if (cioPreviewId) {
    deletePreviewSession(cioPreviewId).catch(() => log('Failed to delete preview session'));
  }

  renderBar();

  if (sessionEndedTimer) clearInterval(sessionEndedTimer);
  sessionEndedTimer = setInterval(() => {
    sessionEndedCountdown -= 1;
    if (sessionEndedCountdown <= 0) {
      clearInterval(sessionEndedTimer!);
      sessionEndedTimer = null;
      window.location.reload();
    } else {
      renderBar();
    }
  }, 1000);
}

export function setPreviewBarInitialStep(
  stepName: string | null,
  displayType: string | null
): void {
  pendingInitialStepName = stepName;
  pendingInitialDisplayType = displayType;
}

export function destroyPreviewBar(): void {
  if (pickerCleanup) pickerCleanup();
  if (sessionEndedTimer) {
    clearInterval(sessionEndedTimer);
    sessionEndedTimer = null;
  }
  restoreAllCapturedElements();
  document.getElementById(BAR_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  currentInstanceId = null;
  currentSteps = [];
  currentSettings = {};
  currentStepName = null;
  isSessionEnded = false;
  sessionEndedCountdown = 5;
}
