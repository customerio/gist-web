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
  transition: transform 0.15s ease;
}
#gist-inbox-button:hover {
  transform: scale(1.05);
}
#gist-inbox-button svg {
  width: 24px;
  height: 24px;
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
}
#gist-inbox-messages {
  overflow-y: auto;
  flex: 1;
}
`;
