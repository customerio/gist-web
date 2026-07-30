// Config storage shared by every demo page. The form that edits it lives in
// debug-console.js.
const defaultConfig = {
  siteId: "siteid",
  dataCenter: "us",
  env: "dev",
  logging: true,
  useAnonymousSession: false,
  userToken: ""
};

// Load configuration from localStorage or use defaults
function loadConfig() {
  const savedConfig = localStorage.getItem('gistConfig');
  if (!savedConfig) return defaultConfig;
  try {
    // Merge over the defaults so a config saved before a field existed still
    // gets that field, and a corrupted value can't break every demo page.
    return { ...defaultConfig, ...JSON.parse(savedConfig) };
  } catch {
    return defaultConfig;
  }
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
