// Shared bootstrap for every demo page: theme handling, Gist init, and the
// event-log appender feeding the debug console's #pageEventLog (only present
// on debug.html). Load order per page: settings.js → demo-page.js →
// ../dist/gist.js → initDemoPage(route); debug.html loads debug-console.js
// after init (it subscribes to Gist.events, which setup creates; events fired
// before the console renders are dropped by logPageEvent's null guard).

// ─── Theme ───────────────────────────────────────────────────────
function getPreferredTheme() {
  const saved = localStorage.getItem('gistTheme');
  if (saved) return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('gistTheme', next);
  applyTheme(next);
}

applyTheme(getPreferredTheme());

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
  if (!localStorage.getItem('gistTheme')) {
    applyTheme(e.matches ? 'dark' : 'light');
  }
});

// ─── Gist setup + event logging ──────────────────────────────────
function initDemoPage(route) {
  const config = getConfig();
  Gist.setup({
    siteId: config.siteId,
    dataCenter: config.dataCenter,
    logging: config.logging,
    env: config.env,
    useAnonymousSession: config.useAnonymousSession,
    colorScheme: 'auto'
  });
  Gist.setUserToken(config.userToken);
  Gist.setCurrentRoute(route);

  Gist.events.on('messageShown', message => {
    console.log(`onMessageShown: ${message.messageId} with instanceId: ${message.instanceId}`);
    logPageEvent('shown', `Message shown: ${message.messageId}`);
  });

  Gist.events.on('messageDismissed', message => {
    console.log(`onMessageDismissed: ${message.messageId} with instanceId: ${message.instanceId}`);
    logPageEvent('dismiss', `Message dismissed: ${message.messageId}`);
  });

  Gist.events.on('messageError', message => {
    console.log(`onMessageError: ${message.messageId} with instanceId: ${message.instanceId}`);
    logPageEvent('error', `Message error: ${message.messageId}`);
  });

  Gist.events.on('messageAction', params => {
    console.log(`onMessageAction, Action: ${params.action} with name ${params.name} on route: ${params.message.currentRoute} with instanceId: ${params.message.instanceId}`);
    logPageEvent('action', `Action: ${params.action} (${params.name})`);
  });
}

// Appends an entry to the debug console's event log (#pageEventLog), newest
// first. Types: shown | dismiss | error | action | page ("page" is for local
// milestones like the late anchor mounting on tooltips.html).
function logPageEvent(type, text) {
  const log = document.getElementById('pageEventLog');
  if (!log) return;

  const noEvents = log.querySelector('.no-events');
  if (noEvents) noEvents.remove();

  const tagClass = {
    shown: 'tag-shown',
    action: 'tag-action',
    error: 'tag-error',
    dismiss: 'tag-dismiss',
    page: 'tag-action'
  }[type] || 'tag-action';

  const entry = document.createElement('div');
  entry.className = 'log-entry';

  const tag = document.createElement('span');
  tag.className = `tag ${tagClass}`;
  tag.textContent = type.toUpperCase();

  const message = document.createElement('span');
  message.textContent = text;

  entry.appendChild(tag);
  entry.appendChild(message);
  log.prepend(entry);

  while (log.children.length > 50) {
    log.removeChild(log.lastChild);
  }
}
