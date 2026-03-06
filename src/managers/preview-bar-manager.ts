import Gist from '../gist';
import { DisplaySettings, GistMessage, StepDisplayConfig } from '../types';
import { applyMessageStepChange, hideMessageVisually } from './message-manager';
import { sendDisplaySettingsToIframe } from './message-component-manager';
import { hasDisplayChanged } from '../utilities/message-utils';
import { log } from '../utilities/log';
import { PREVIEW_BAR_CSS, chevronSvg } from './preview-bar-styles';
import { savePreviewDisplaySettings } from '../services/preview-service';
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
let pickerActive = false;
let pickerCleanup: (() => void) | null = null;
let pendingInitialStepName: string | null = null;
let pendingInitialDisplayType: string | null = null;

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

  const maxWidthInput = createInput('number', settings.maxWidth ?? 414, '80px');
  maxWidthInput.addEventListener('change', () =>
    emitSettings({ ...currentSettings, maxWidth: parseInt(maxWidthInput.value) || 414 })
  );
  row.appendChild(labelGroup('Max Width', maxWidthInput));
}

function buildInlineControls(settings: DisplaySettings, row: HTMLElement) {
  const selectorInput = createInput('text', settings.elementSelector || '', '260px');
  selectorInput.placeholder = 'Element ID or selector';
  selectorInput.addEventListener('change', () =>
    emitSettings({ ...currentSettings, elementSelector: selectorInput.value })
  );

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

// ─── Element picker ───────────────────────────────────────────────────────────

function buildUniqueSelector(element: HTMLElement): string {
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
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }

    parts.unshift(part);
    try {
      if (document.querySelectorAll(parts.join(' > ')).length === 1) break;
    } catch {
      /* keep walking up */
    }

    current = current.parentElement;
  }

  return parts.join(' > ');
}

function startElementPicker(target: HTMLInputElement) {
  if (pickerActive) return;
  pickerActive = true;

  const settingsBeforePicker = { ...currentSettings };
  const msg =
    Gist.currentMessages.find((m: GistMessage) => m.instanceId === currentInstanceId) ?? null;
  if (msg) hideMessageVisually(msg);

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
      under.classList.remove('gist-pb-pick-highlight');
      const selector = buildUniqueSelector(under);
      target.value = selector;
      emitSettings({ ...currentSettings, elementSelector: selector });
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
  bar.classList.toggle('gist-pb-hidden', !currentInstanceId);
  bar.innerHTML = '';
  if (!currentInstanceId) return;

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
        if (msg && isReadyToApply(step.displaySettings))
          applyMessageStepChange(msg, step.stepName, step.displaySettings);
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
    const updated: DisplaySettings = { ...currentSettings, displayType: newType };
    if (newType === 'modal') {
      updated.modalPosition = updated.modalPosition || 'center';
      delete updated.overlayPosition;
      delete updated.elementSelector;
    } else if (newType === 'overlay') {
      updated.overlayPosition = updated.overlayPosition || 'topCenter';
      delete updated.modalPosition;
      delete updated.elementSelector;
    } else if (newType === 'inline') {
      delete updated.modalPosition;
      delete updated.overlayPosition;
    }
    currentSettings = updated;
    emitSettings(currentSettings);
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
  currentInstanceId = null;
  currentSteps = [];
  currentSettings = {};
  currentStepName = null;
  renderBar();
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
  document.getElementById(BAR_ID)?.remove();
  document.getElementById(STYLE_ID)?.remove();
  currentInstanceId = null;
  currentSteps = [];
  currentSettings = {};
  currentStepName = null;
}
