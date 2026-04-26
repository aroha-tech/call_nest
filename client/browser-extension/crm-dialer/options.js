const DEFAULTS = {
  baseUrl: 'http://localhost:4000',
  apiKey: '',
  provider: 'dummy',
  defaultCountryCode: '+91',
  autoUpsertBeforeCall: true,
  allowUnknownCrmHosts: false,
  allowedHostSuffixes: [
    'zoho.com',
    'hubspot.com',
    'salesforce.com',
    'pipedrive.com',
    'freshworks.com',
    'zendesk.com',
    'monday.com'
  ]
};

async function loadSettings() {
  const data = await chrome.storage.sync.get(DEFAULTS);
  document.getElementById('baseUrl').value = data.baseUrl || DEFAULTS.baseUrl;
  document.getElementById('apiKey').value = data.apiKey || '';
  document.getElementById('provider').value = data.provider || DEFAULTS.provider;
  document.getElementById('defaultCountryCode').value = data.defaultCountryCode || DEFAULTS.defaultCountryCode;
  document.getElementById('autoUpsertBeforeCall').checked = data.autoUpsertBeforeCall !== false;
  document.getElementById('allowUnknownCrmHosts').checked = data.allowUnknownCrmHosts === true;
  document.getElementById('allowedHostSuffixes').value = Array.isArray(data.allowedHostSuffixes)
    ? data.allowedHostSuffixes.join(',')
    : DEFAULTS.allowedHostSuffixes.join(',');
  await renderLogs();
}

async function saveSettings() {
  const suffixes = document
    .getElementById('allowedHostSuffixes')
    .value.split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const payload = {
    baseUrl: document.getElementById('baseUrl').value.trim(),
    apiKey: document.getElementById('apiKey').value.trim(),
    provider: document.getElementById('provider').value.trim() || 'dummy',
    defaultCountryCode: document.getElementById('defaultCountryCode').value.trim() || '+91',
    autoUpsertBeforeCall: document.getElementById('autoUpsertBeforeCall').checked,
    allowUnknownCrmHosts: document.getElementById('allowUnknownCrmHosts').checked,
    allowedHostSuffixes: suffixes.length ? suffixes : DEFAULTS.allowedHostSuffixes
  };
  const status = document.getElementById('status');
  try {
    await chrome.storage.sync.set(payload);
    status.className = 'ok';
    status.textContent = 'Saved.';
  } catch (err) {
    status.className = 'err';
    status.textContent = err?.message || 'Failed to save settings.';
  }
}

async function renderLogs() {
  const logsBox = document.getElementById('logs');
  const stored = await chrome.storage.local.get({ callnestLogs: [] });
  const logs = Array.isArray(stored.callnestLogs) ? stored.callnestLogs : [];
  if (!logs.length) {
    logsBox.textContent = 'No logs yet.';
    return;
  }
  logsBox.textContent = logs
    .slice(0, 40)
    .map((l) => `[${l.at}] ${String(l.level || 'info').toUpperCase()} ${l.event || 'event'} ${JSON.stringify(l.details || {})}`)
    .join('\n');
}

async function clearLogs() {
  await chrome.storage.local.set({ callnestLogs: [] });
  await renderLogs();
}

document.getElementById('saveBtn').addEventListener('click', saveSettings);
document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
loadSettings();
