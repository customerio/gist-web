// Debug console for the Debug Console page: config overrides, active message
// display settings, and a live Gist event log. Renders into #debugConsoleHost,
// which only exists on debug.html — the other pages reach it via the nav.
// Load order: settings.js → demo-page.js → ../dist/gist.js →
// initDemoPage('debug') → debug-console.js. Must load AFTER initDemoPage:
// Gist.events only exists once Gist.setup() has run, and this file subscribes
// to it at parse time.

const DEBUG_CONSOLE_TEMPLATE = `
  <form id="configForm">
    <div class="form-section">
      <h4>Gist.setup()</h4>
      <div class="form-field">
        <label for="siteId">Site ID:</label>
        <input type="text" id="siteId" name="siteId" />
      </div>
      <div class="form-field">
        <label for="dataCenter">Data Center:</label>
        <select id="dataCenter" name="dataCenter">
          <option value="us">us</option>
          <option value="eu">eu</option>
        </select>
      </div>
      <div class="form-field">
        <label for="env">Environment:</label>
        <select id="env" name="env">
          <option value="prod">prod</option>
          <option value="dev">dev</option>
          <option value="local">local</option>
        </select>
      </div>
      <div class="form-field">
        <label for="logging">
          <input type="checkbox" id="logging" name="logging" />
          Logging
        </label>
      </div>
      <div class="form-field">
        <label for="useAnonymousSession">
          <input type="checkbox" id="useAnonymousSession" name="useAnonymousSession" />
          Use Anonymous Session
        </label>
      </div>
    </div>
    <div class="form-section">
      <h4>Gist.setUserToken()</h4>
      <div class="form-field">
        <label for="userToken">User Token:</label>
        <input type="text" id="userToken" name="userToken" />
      </div>
    </div>
    <div class="form-actions">
      <button type="submit" class="button primary">Save &amp; Reload</button>
      <button type="button" class="button" id="resetConfigBtn">Reset to Defaults</button>
    </div>
  </form>
  <div class="form-section" style="margin-top: 20px;">
    <h4>Active Messages &amp; Display Settings</h4>
    <div id="activeMessages" style="margin-top: 10px;">
      <p style="color: var(--text-faint); font-size: 14px;">No active messages</p>
    </div>
    <button type="button" class="button" id="refreshMessagesBtn" style="margin-top: 10px;">Refresh Messages</button>
  </div>
  <div class="form-section" style="margin-top: 20px;">
    <h4>Event Log</h4>
    <div class="tooltip-event-log" id="pageEventLog" style="margin-top: 10px;">
      <div class="no-events">Gist events will appear here…</div>
    </div>
  </div>
`;

(function setupDebugConsole() {
  const host = document.getElementById('debugConsoleHost');
  if (!host) return;

  host.innerHTML = DEBUG_CONSOLE_TEMPLATE;

  const config = getConfig();
  document.getElementById('siteId').value = config.siteId;
  document.getElementById('dataCenter').value = config.dataCenter;
  document.getElementById('env').value = config.env;
  document.getElementById('logging').checked = config.logging;
  document.getElementById('useAnonymousSession').checked = config.useAnonymousSession;
  document.getElementById('userToken').value = config.userToken;

  document.getElementById('configForm').addEventListener('submit', function (event) {
    event.preventDefault();
    storeConfig({
      siteId: document.getElementById('siteId').value,
      dataCenter: document.getElementById('dataCenter').value,
      env: document.getElementById('env').value,
      logging: document.getElementById('logging').checked,
      useAnonymousSession: document.getElementById('useAnonymousSession').checked,
      userToken: document.getElementById('userToken').value
    });
    window.location.reload();
  });

  document.getElementById('resetConfigBtn').addEventListener('click', function () {
    if (confirm('Are you sure you want to reset to default configuration?')) {
      clearStoredConfig();
      window.location.reload();
    }
  });

  document.getElementById('refreshMessagesBtn').addEventListener('click', refreshActiveMessages);

  // Keep the active messages list fresh as messages come and go
  Gist.events.on('messageShown', function () {
    setTimeout(refreshActiveMessages, 500);
  });

  Gist.events.on('messageDismissed', function () {
    setTimeout(refreshActiveMessages, 500);
  });

  refreshActiveMessages();
})();

function refreshActiveMessages() {
  const container = document.getElementById('activeMessages');
  if (!container) return;

  if (!Gist.currentMessages || Gist.currentMessages.length === 0) {
    container.innerHTML = '<p style="color: var(--text-faint); font-size: 14px;">No active messages</p>';
    return;
  }

  let html = '';
  Gist.currentMessages.forEach((message, index) => {
    const displaySettings = message.displaySettings || {};
    const displaySettingsJson = JSON.stringify(displaySettings, null, 2);

    html += `
      <div style="border: 1px solid var(--border-light); border-radius: 4px; padding: 10px; margin-bottom: 10px; background: var(--bg-surface-alt);">
        <div style="font-weight: bold; margin-bottom: 5px;">
          Message: ${message.messageId || 'Unknown'}
          <span style="font-size: 11px; color: var(--text-muted); font-weight: normal;">(${message.instanceId})</span>
        </div>
        <div style="margin-bottom: 8px;">
          <label style="display: block; font-size: 13px; font-weight: bold; margin-bottom: 4px;">Display Settings JSON:</label>
          <textarea
            id="displaySettings-${index}"
            style="width: 100%; min-height: 100px; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid var(--border); border-radius: 3px; background: var(--input-bg); color: var(--input-color);"
          >${displaySettingsJson}</textarea>
        </div>
        <button
          class="button"
          onclick="updateMessageDisplaySettings(${index})"
          style="padding: 4px 12px; font-size: 12px;">
          Save & Update
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}

function updateMessageDisplaySettings(messageIndex) {
  const message = Gist.currentMessages[messageIndex];
  if (!message) {
    console.error('Message not found at index', messageIndex);
    return;
  }

  const textarea = document.getElementById(`displaySettings-${messageIndex}`);
  try {
    const newDisplaySettings = JSON.parse(textarea.value);
    console.log('Updating display settings for message:', message.instanceId, newDisplaySettings);

    const success = Gist.updateMessageDisplaySettings(message.instanceId, newDisplaySettings);
    if (success) {
      console.log('Display settings updated successfully');
    } else {
      console.error('Failed to update display settings');
    }
  } catch (e) {
    console.error('Invalid JSON:', e);
    alert('Invalid JSON: ' + e.message);
  }
}
