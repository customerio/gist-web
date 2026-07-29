// Config storage shared by every demo page. The form that edits it lives in
// debug-console.js.
const defaultConfig = {
  siteId: "a5ec106751ef4b34a0b9",
  dataCenter: "eu",
  env: "prod",
  logging: true,
  useAnonymousSession: true,
  userToken: "ABC123"
};

// Load configuration from localStorage or use defaults
function loadConfig() {
  const savedConfig = localStorage.getItem('gistConfig');
  return savedConfig ? JSON.parse(savedConfig) : defaultConfig;
}

// Get current configuration
function getConfig() {
  return loadConfig();
}

// Persist a new configuration
function storeConfig(newConfig) {
  localStorage.setItem('gistConfig', JSON.stringify(newConfig));
}

// Drop the stored configuration, falling back to defaults
function clearStoredConfig() {
  localStorage.removeItem('gistConfig');
}
