export const INBOX_CSS = `
#gist-inbox-button {
  position: fixed;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9998;
  border: none;
  transition: background-color 0.2s ease,
              box-shadow 0.2s ease,
              transform 0.15s ease;
}
#gist-inbox-button:hover {
  transform: scale(1.05);
}
#gist-inbox-button:active {
  transform: scale(0.93);
}
#gist-inbox-button svg {
  width: 24px;
  height: 24px;
}
#gist-inbox-button svg [fill]:not([fill="none"]) {
  fill: currentColor;
}
#gist-inbox-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  box-sizing: border-box;
}
#gist-inbox-panel {
  position: fixed;
  width: 400px;
  max-height: 600px;
  z-index: 9999;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  user-select: none;
  -webkit-user-select: none;
  transform: translateY(8px) scale(0.96);
  opacity: 0;
  pointer-events: none;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
              opacity 0.2s ease;
}
#gist-inbox-panel.gist-inbox-panel--open {
  transform: translateY(0) scale(1);
  opacity: 1;
  pointer-events: auto;
}
#gist-inbox-messages {
  overflow-y: auto;
  flex: 1;
}
.gist-inbox-message-row {
  transition: background-color 0.15s ease;
}
@media (max-width: 424px) {
  #gist-inbox-panel {
    width: auto !important;
    left: 12px !important;
    right: 12px !important;
  }
}
`;
