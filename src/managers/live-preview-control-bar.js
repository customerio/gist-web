import { log } from '../utilities/log';
import { livePreviewControlBarTemplate } from '../templates/live-preview-control-bar';
import { startElementPicker } from './live-preview-element-picker';

let currentSettings = null;
let onSettingsChange = null;
let onSaveChanges = null;

export function initControlBar(settings, onChangeCallback, onSaveCallback) {
    currentSettings = settings;
    onSettingsChange = onChangeCallback;
    onSaveChanges = onSaveCallback;
    
    injectControlBar();
    attachEventListeners();
    updateControlsVisibility();
    populateControlValues();
    
    log('Live preview control bar initialized');
}

export function removeControlBar() {
    const bar = document.getElementById('gist-live-preview-bar');
    if (bar) {
        bar.remove();
    }
}

function injectControlBar() {
    // Remove existing bar if present
    removeControlBar();
    
    // Inject new bar
    document.body.insertAdjacentHTML('beforeend', livePreviewControlBarTemplate());
}

function attachEventListeners() {
    const displayType = document.getElementById('gist-preview-display-type');
    const modalPosition = document.getElementById('gist-preview-modal-position');
    const overlayColor = document.getElementById('gist-preview-overlay-color');
    const overlayOpacity = document.getElementById('gist-preview-overlay-opacity');
    const messageWidth = document.getElementById('gist-preview-message-width');
    const overlayPosition = document.getElementById('gist-preview-overlay-position');
    const elementId = document.getElementById('gist-preview-element-id');
    const tooltipElementId = document.getElementById('gist-preview-tooltip-element-id');
    const tooltipPosition = document.getElementById('gist-preview-tooltip-position');
    const selectTargetBtn = document.getElementById('gist-preview-select-target');
    const selectTargetTooltipBtn = document.getElementById('gist-preview-select-target-tooltip');
    const saveBtn = document.getElementById('gist-preview-save-changes');
    const minimizeIcon = document.getElementById('gist-preview-minimize-icon');
    const logoBtn = document.getElementById('gist-preview-logo-btn');
    
    displayType.addEventListener('change', handleDisplayTypeChange);
    modalPosition.addEventListener('change', handleSettingChange);
    overlayColor.addEventListener('change', handleOverlayColorChange);
    overlayOpacity.addEventListener('input', handleOverlayColorChange);
    messageWidth.addEventListener('blur', handleMessageWidthBlur);
    overlayPosition.addEventListener('change', handleOverlayPositionChange);
    elementId.addEventListener('input', handleElementIdChange);
    tooltipElementId.addEventListener('input', handleElementIdChange);
    tooltipPosition.addEventListener('change', handleSettingChange);
    
    selectTargetBtn.addEventListener('click', () => {
        selectTargetBtn.classList.toggle('active');
        startElementPicker((id) => {
            elementId.value = id;
            selectTargetBtn.classList.remove('active');
            handleElementIdChange();
        });
    });
    
    selectTargetTooltipBtn.addEventListener('click', () => {
        selectTargetTooltipBtn.classList.toggle('active');
        startElementPicker((id) => {
            tooltipElementId.value = id;
            selectTargetTooltipBtn.classList.remove('active');
            handleElementIdChange();
        });
    });
    
    saveBtn.addEventListener('click', handleSaveClick);
    minimizeIcon.addEventListener('click', handleMinimizeClick);
    logoBtn.addEventListener('click', handleMinimizeClick);
}

function handleMinimizeClick() {
    const bar = document.getElementById('gist-live-preview-bar');
    
    if (bar.classList.contains('minimized')) {
        bar.classList.remove('minimized');
        log('Control bar expanded');
    } else {
        bar.classList.add('minimized');
        log('Control bar minimized');
    }
}

function handleDisplayTypeChange() {
    updateControlsVisibility();
    handleDisplayTypeSettingChange();
}

function handleDisplayTypeSettingChange() {
    const settings = gatherCurrentSettings();
    currentSettings = settings;
    
    if (onSettingsChange) {
        onSettingsChange(settings, true); // true = requires reload
    }
}

function updateControlsVisibility() {
    const displayType = document.getElementById('gist-preview-display-type').value;
    
    const modalControls = document.querySelectorAll('.gist-preview-modal-controls');
    const overlayControls = document.querySelectorAll('.gist-preview-overlay-controls');
    const inlineControls = document.querySelectorAll('.gist-preview-inline-controls');
    const tooltipControls = document.querySelectorAll('.gist-preview-tooltip-controls');
    
    // Hide all
    modalControls.forEach(el => el.classList.add('gist-preview-hidden'));
    overlayControls.forEach(el => el.classList.add('gist-preview-hidden'));
    inlineControls.forEach(el => el.classList.add('gist-preview-hidden'));
    tooltipControls.forEach(el => el.classList.add('gist-preview-hidden'));
    
    // Show relevant controls
    if (displayType === 'modal') {
        modalControls.forEach(el => el.classList.remove('gist-preview-hidden'));
    } else if (displayType === 'overlay') {
        overlayControls.forEach(el => el.classList.remove('gist-preview-hidden'));
    } else if (displayType === 'inline') {
        inlineControls.forEach(el => el.classList.remove('gist-preview-hidden'));
    } else if (displayType === 'tooltip') {
        tooltipControls.forEach(el => el.classList.remove('gist-preview-hidden'));
    }
}

function populateControlValues() {
    if (!currentSettings) return;
    
    document.getElementById('gist-preview-display-type').value = currentSettings.displayType || 'modal';
    document.getElementById('gist-preview-modal-position').value = currentSettings.position || 'center';
    document.getElementById('gist-preview-message-width').value = currentSettings.messageWidth || '414';
    document.getElementById('gist-preview-overlay-position').value = currentSettings.overlayPosition || 'top-center';
    document.getElementById('gist-preview-element-id').value = currentSettings.elementId || '';
    document.getElementById('gist-preview-tooltip-element-id').value = currentSettings.elementId || '';
    document.getElementById('gist-preview-tooltip-position').value = currentSettings.tooltipPosition || 'top-left';
    
    // Parse overlay color
    const overlayColor = currentSettings.overlayColor || '#00000033';
    const color = overlayColor.substring(0, 7);
    const opacity = overlayColor.substring(7, 9) || '33';
    document.getElementById('gist-preview-overlay-color').value = color;
    document.getElementById('gist-preview-overlay-opacity').value = parseInt(opacity, 16).toString().padStart(2, '0');
}

function handleOverlayColorChange() {
    handleSettingChange();
}

function handleMessageWidthBlur() {
    const messageWidthInput = document.getElementById('gist-preview-message-width');
    const value = parseInt(messageWidthInput.value) || 414;
    
    if (value < 414) {
        messageWidthInput.value = 414;
    }
    
    // Always trigger update after blur
    handleSettingChange();
}

function handleOverlayPositionChange() {
    const settings = gatherCurrentSettings();
    currentSettings = settings;
    
    if (onSettingsChange) {
        onSettingsChange(settings, true); // true = requires reload (different container)
    }
}

function handleElementIdChange() {
    const settings = gatherCurrentSettings();
    currentSettings = settings;
    
    if (onSettingsChange) {
        onSettingsChange(settings, true); // true = requires reload (different container)
    }
}

function handleSettingChange() {
    const settings = gatherCurrentSettings();
    currentSettings = settings;
    
    if (onSettingsChange) {
        onSettingsChange(settings, false); // false = just update styles, no reload
    }
}

function handleSaveClick() {
    const settings = gatherCurrentSettings();
    
    if (onSaveChanges) {
        onSaveChanges(settings);
    }
}

function gatherCurrentSettings() {
    const displayType = document.getElementById('gist-preview-display-type').value;
    const modalPosition = document.getElementById('gist-preview-modal-position').value;
    const messageWidth = document.getElementById('gist-preview-message-width').value || '414';
    const overlayPosition = document.getElementById('gist-preview-overlay-position').value;
    const tooltipPosition = document.getElementById('gist-preview-tooltip-position').value;
    
    const color = document.getElementById('gist-preview-overlay-color').value;
    const opacity = document.getElementById('gist-preview-overlay-opacity').value;
    const opacityHex = parseInt(opacity || '33').toString(16).padStart(2, '0');
    const overlayColor = color + opacityHex;
    
    let elementId = '';
    if (displayType === 'inline') {
        elementId = document.getElementById('gist-preview-element-id').value;
    } else if (displayType === 'tooltip') {
        elementId = document.getElementById('gist-preview-tooltip-element-id').value;
    } else if (displayType === 'overlay') {
        // Map overlay position to elementId
        elementId = mapOverlayPositionToElementId(overlayPosition);
    }
    
    return {
        displayType,
        position: modalPosition,
        messageWidth,
        overlayColor,
        overlayPosition,
        tooltipPosition,
        elementId,
        exitClick: false,
        persistent: false
    };
}

function mapOverlayPositionToElementId(position) {
    const mapping = {
        'top-center': 'x-gist-floating-top',
        'top-left': 'x-gist-floating-top-left',
        'top-right': 'x-gist-floating-top-right',
        'bottom-center': 'x-gist-floating-bottom',
        'bottom-left': 'x-gist-floating-bottom-left',
        'bottom-right': 'x-gist-floating-bottom-right'
    };
    return mapping[position] || 'x-gist-floating-top';
}

export function getCurrentSettings() {
    return currentSettings;
}

