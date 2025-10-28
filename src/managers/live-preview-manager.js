import { log } from '../utilities/log';
import { getKeyFromLocalStore, setKeyToLocalStore } from '../utilities/local-storage';
import { fetchPreviewData, savePreviewData } from '../services/live-preview-network';
import { initControlBar } from './live-preview-control-bar';
import { showMessage, embedMessage, hideMessage, fetchMessageByInstanceId } from './message-manager';

const LIVE_PREVIEW_STORAGE_KEY = 'gist.web.livePreview';
const TTL_HOURS = 6;

let currentSessionId = null;
let currentPreviewData = null;
let currentMessageInstanceId = null;

export async function initLivePreview(sessionId) {
    currentSessionId = sessionId;
    
    try {
        // Try to load from cache first
        currentPreviewData = loadPreviewDataFromCache(sessionId);
        
        // If not in cache, fetch from API
        if (!currentPreviewData) {
            log('Fetching preview data from API...');
            const response = await fetchPreviewData(sessionId);
            
            if (response.status === 200 && response.data) {
                currentPreviewData = response.data;
                savePreviewDataToCache(sessionId, currentPreviewData);
                log('Preview data fetched and cached');
            } else {
                log(`Failed to fetch preview data: ${response.status}`);
                return;
            }
        } else {
            log('Loaded preview data from cache');
        }
        
        // Load the message
        await loadPreviewMessage();
        
        // Initialize control bar
        const settings = extractSettingsFromPreviewData();
        initControlBar(settings, handleSettingsChange, handleSaveChanges);
        
    } catch (error) {
        log(`Error initializing live preview: ${error.message || error}`);
    }
}

function loadPreviewDataFromCache(sessionId) {
    const key = `${LIVE_PREVIEW_STORAGE_KEY}.${sessionId}`;
    return getKeyFromLocalStore(key);
}

function savePreviewDataToCache(sessionId, data) {
    const key = `${LIVE_PREVIEW_STORAGE_KEY}.${sessionId}`;
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + TTL_HOURS);
    setKeyToLocalStore(key, data, expiryDate);
}

function extractSettingsFromPreviewData() {
    if (!currentPreviewData || !currentPreviewData.message) {
        return {
            displayType: 'modal',
            position: 'center',
            messageWidth: '414',
            overlayColor: '#00000033',
            overlayPosition: 'top-center',
            tooltipPosition: 'top-left',
            elementId: '',
            exitClick: false,
            persistent: false
        };
    }
    
    const message = currentPreviewData.message;
    
    // Determine display type based on message properties
    let displayType = 'modal';
    let elementId = '';
    let overlayPosition = 'top-center';
    
    if (message.elementId) {
        // Check if it's an overlay position
        const overlayPositions = [
            'x-gist-floating-top',
            'x-gist-floating-top-left', 
            'x-gist-floating-top-right',
            'x-gist-floating-bottom',
            'x-gist-floating-bottom-left',
            'x-gist-floating-bottom-right'
        ];
        
        if (overlayPositions.includes(message.elementId)) {
            displayType = 'overlay';
            overlayPosition = mapElementIdToOverlayPosition(message.elementId);
        } else {
            displayType = 'inline'; // or could be tooltip, default to inline
            elementId = message.elementId;
        }
    }
    
    return {
        displayType,
        position: message.position || 'center',
        messageWidth: message.messageWidth?.toString() || '414',
        overlayColor: message.overlayColor || '#00000033',
        overlayPosition,
        tooltipPosition: 'top-left',
        elementId,
        exitClick: message.exitClick || false,
        persistent: message.persistent || false
    };
}

function mapElementIdToOverlayPosition(elementId) {
    const mapping = {
        'x-gist-floating-top': 'top-center',
        'x-gist-floating-top-left': 'top-left',
        'x-gist-floating-top-right': 'top-right',
        'x-gist-floating-bottom': 'bottom-center',
        'x-gist-floating-bottom-left': 'bottom-left',
        'x-gist-floating-bottom-right': 'bottom-right'
    };
    return mapping[elementId] || 'top-center';
}

async function loadPreviewMessage() {
    if (!currentPreviewData) return;
    
    const message = buildMessageObject();
    
    // Determine if it's overlay or embed
    if (message.properties.gist.elementId) {
        const loadedMessage = await embedMessage(message, message.properties.gist.elementId);
        currentMessageInstanceId = loadedMessage ? loadedMessage.instanceId : null;
    } else {
        const loadedMessage = await showMessage(message);
        currentMessageInstanceId = loadedMessage ? loadedMessage.instanceId : null;
    }
    
    log(`Live preview message loaded with instance ID: ${currentMessageInstanceId}`);
}

function buildMessageObject() {
    const messageData = currentPreviewData.message;
    
    return {
        messageId: `live-preview-${currentSessionId}`,
        queueId: null,
        properties: {
            gist: {
                elementId: messageData.elementId || '',
                routeRuleWeb: '',
                position: messageData.position || '',
                scale: false,
                campaignId: null,
                messageWidth: parseInt(messageData.messageWidth) || 414,
                overlayColor: messageData.overlayColor || '#00000033',
                persistent: messageData.persistent || false,
                exitClick: messageData.exitClick || false,
                encodedMessageHtml: messageData.encodedMessageHtml || ''
            }
        }
    };
}

async function handleSettingsChange(settings, requiresReload = false) {
    // Update preview data with new settings
    updatePreviewDataWithSettings(settings);
    
    // Save to cache
    savePreviewDataToCache(currentSessionId, currentPreviewData);
    
    if (requiresReload) {
        log('Display type changed, reloading message...');
        
        // Dismiss current message
        if (currentMessageInstanceId) {
            const message = fetchMessageByInstanceId(currentMessageInstanceId);
            if (message) {
                await hideMessage(message);
            }
        }
        
        // Small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Reload with new settings
        await loadPreviewMessage();
    } else {
        log('Settings changed, updating styles...');
        updateMessageStyles(settings);
    }
}

function updateMessageStyles(settings) {
    if (!currentMessageInstanceId) return;
    
    const message = fetchMessageByInstanceId(currentMessageInstanceId);
    if (!message) return;

    const messageElementId = `gist-${currentMessageInstanceId}`;
    const messageElement = document.getElementById(messageElementId);
    
    if (!messageElement) return;
    
    // Update message width
    if (settings.messageWidth) {
        messageElement.style.maxWidth = `${settings.messageWidth}px`;
        messageElement.style.width = '100%';
    }
    
    // Update overlay color (for modal)
    if (settings.displayType === 'modal') {
        const overlayElement = document.getElementById('gist-overlay');
        if (overlayElement) {
            overlayElement.style.backgroundColor = settings.overlayColor;
        }
        
        // Update modal position
        const messageIframe = messageElement;
        if (messageIframe && messageIframe.classList.contains('gist-message')) {
            // Remove existing position classes
            messageIframe.classList.remove('gist-top', 'gist-center', 'gist-bottom');
            // Add new position class
            messageIframe.classList.add(`gist-${settings.position}`);
        }
    }
    
    // Update elementId for overlay position or inline/tooltip target changes
    if (message.properties && message.properties.gist) {
        const oldElementId = message.properties.gist.elementId;
        const newElementId = settings.elementId;
        
        if (oldElementId !== newElementId) {
            message.properties.gist.elementId = newElementId;
            
            // For overlay positions, the element container changes, so we need to move the iframe
            if (settings.displayType === 'overlay' && newElementId) {
                moveMessageToNewContainer(messageElement, oldElementId, newElementId);
            }
            
            log(`ElementId updated from "${oldElementId}" to "${newElementId}"`);
        }
    }
    
    log('Styles updated without reload');
}

function moveMessageToNewContainer(messageElement, oldElementId, newElementId) {
    // Get or create the new container
    const newContainer = document.getElementById(newElementId);
    if (!newContainer) {
        // Create the container if it doesn't exist (for SDK positions)
        const positions = ["x-gist-top", "x-gist-floating-top", "x-gist-bottom", "x-gist-floating-bottom", "x-gist-floating-bottom-left", "x-gist-floating-bottom-right", "x-gist-floating-top-left", "x-gist-floating-top-right"];
        if (positions.includes(newElementId)) {
            const element = document.createElement("div");
            element.id = newElementId;
            document.body.insertAdjacentElement("beforeend", element);
        }
    }
    
    // Move the iframe to the new container
    const targetContainer = document.getElementById(newElementId);
    if (targetContainer && messageElement.parentElement) {
        const oldContainer = messageElement.parentElement;
        targetContainer.appendChild(messageElement);
        
        // Clean up old container if it was an SDK position and is now empty
        if (oldElementId && oldContainer && oldContainer.children.length === 0) {
            const sdkPositions = ["x-gist-top", "x-gist-floating-top", "x-gist-bottom", "x-gist-floating-bottom", "x-gist-floating-bottom-left", "x-gist-floating-bottom-right", "x-gist-floating-top-left", "x-gist-floating-top-right"];
            if (sdkPositions.includes(oldElementId)) {
                oldContainer.remove();
            }
        }
        
        log(`Message moved from "${oldElementId}" to "${newElementId}"`);
    }
}

async function handleSaveChanges(settings) {
    log('Saving changes to API...');
    
    // Update preview data with new settings
    updatePreviewDataWithSettings(settings);
    
    // Save to cache
    savePreviewDataToCache(currentSessionId, currentPreviewData);
    
    try {
        // Prepare payload
        const messageData = {
            position: settings.position,
            messageWidth: settings.messageWidth,
            overlayColor: settings.overlayColor,
            exitClick: settings.exitClick,
            persistent: settings.persistent,
            encodedMessageHtml: currentPreviewData.message.encodedMessageHtml,
            elementId: settings.elementId || ''
        };
        
        const response = await savePreviewData(currentSessionId, messageData);
        
        if (response.status === 200) {
            log('Changes saved successfully');
        } else {
            log(`Failed to save changes: ${response.status}`);
        }
    } catch (error) {
        log(`Error saving changes: ${error.message || error}`);
    }
}

function updatePreviewDataWithSettings(settings) {
    if (!currentPreviewData.message) {
        currentPreviewData.message = {};
    }
    
    currentPreviewData.message.position = settings.position;
    currentPreviewData.message.messageWidth = settings.messageWidth;
    currentPreviewData.message.overlayColor = settings.overlayColor;
    currentPreviewData.message.exitClick = settings.exitClick;
    currentPreviewData.message.persistent = settings.persistent;
    currentPreviewData.message.elementId = settings.elementId || '';
}

