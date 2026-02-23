// Default configuration
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

// Populate form with current config
function populateConfigForm() {
  const config = loadConfig();
  document.getElementById('siteId').value = config.siteId;
  document.getElementById('dataCenter').value = config.dataCenter;
  document.getElementById('env').value = config.env;
  document.getElementById('logging').checked = config.logging;
  document.getElementById('useAnonymousSession').checked = config.useAnonymousSession;
  document.getElementById('userToken').value = config.userToken;
}

// Toggle config form visibility
function toggleConfigForm() {
  const content = document.getElementById('configFormContent');
  const icon = document.getElementById('configToggleIcon');
  if (content.style.display === 'none' || !content.style.display) {
    content.style.display = 'block';
    icon.textContent = '▲';
  } else {
    content.style.display = 'none';
    icon.textContent = '▼';
  }
}

// Save config and reload page
function saveConfig(event) {
  event.preventDefault();
  const newConfig = {
    siteId: document.getElementById('siteId').value,
    dataCenter: document.getElementById('dataCenter').value,
    env: document.getElementById('env').value,
    logging: document.getElementById('logging').checked,
    useAnonymousSession: document.getElementById('useAnonymousSession').checked,
    userToken: document.getElementById('userToken').value
  };
  localStorage.setItem('gistConfig', JSON.stringify(newConfig));
  window.location.reload();
}

// Reset to default config
function resetConfig() {
  if (confirm('Are you sure you want to reset to default configuration?')) {
    localStorage.removeItem('gistConfig');
    window.location.reload();
  }
}

// Initialize form on page load
window.addEventListener('DOMContentLoaded', function() {
  populateConfigForm();
});
