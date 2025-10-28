import { log } from '../utilities/log';

let isPickerActive = false;
let highlightOverlay = null;
let onElementSelected = null;

export function startElementPicker(callback) {
    if (isPickerActive) {
        stopElementPicker();
        return;
    }
    
    isPickerActive = true;
    onElementSelected = callback;
    
    createHighlightOverlay();
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    
    log('Element picker activated');
}

export function stopElementPicker() {
    isPickerActive = false;
    onElementSelected = null;
    
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    
    if (highlightOverlay) {
        highlightOverlay.remove();
        highlightOverlay = null;
    }
    
    log('Element picker deactivated');
}

function createHighlightOverlay() {
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'gist-element-picker-overlay';
    highlightOverlay.style.cssText = `
        position: absolute;
        pointer-events: none;
        border: 2px solid #3498db;
        background: rgba(52, 152, 219, 0.1);
        z-index: 9999999999;
        transition: all 0.1s ease;
    `;
    document.body.appendChild(highlightOverlay);
}

function handleMouseMove(event) {
    if (!isPickerActive) return;
    
    const target = event.target;
    
    // Ignore the control bar and highlight overlay itself
    if (target.id === 'gist-live-preview-bar' || 
        target.closest('#gist-live-preview-bar') ||
        target.id === 'gist-element-picker-overlay') {
        if (highlightOverlay) {
            highlightOverlay.style.display = 'none';
        }
        return;
    }
    
    if (highlightOverlay) {
        highlightOverlay.style.display = 'block';
        const rect = target.getBoundingClientRect();
        highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
        highlightOverlay.style.left = `${rect.left + window.scrollX}px`;
        highlightOverlay.style.width = `${rect.width}px`;
        highlightOverlay.style.height = `${rect.height}px`;
    }
}

function handleClick(event) {
    if (!isPickerActive) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.target;
    
    // Ignore clicks on the control bar
    if (target.id === 'gist-live-preview-bar' || 
        target.closest('#gist-live-preview-bar')) {
        return;
    }
    
    // Get or generate an ID for the element
    let elementId = target.id;
    if (!elementId) {
        // Generate a unique ID if the element doesn't have one
        elementId = `gist-target-${Date.now()}`;
        target.id = elementId;
        log(`Generated ID for selected element: ${elementId}`);
    }
    
    if (onElementSelected) {
        onElementSelected(elementId);
    }
    
    stopElementPicker();
}

