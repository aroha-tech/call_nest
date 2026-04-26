const DEFAULT_SETTINGS = {
  baseUrl: 'http://localhost:4000',
  apiKey: '',
  provider: 'exotel',
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

const CRM_HOST_MAP = {
  'zoho.com': 'zoho_crm',
  'hubspot.com': 'hubspot',
  'salesforce.com': 'salesforce',
  'pipedrive.com': 'pipedrive',
  'freshworks.com': 'freshsales',
  'zendesk.com': 'zendesk',
  'monday.com': 'monday_crm'
};

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function detectCrmFromHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  for (const suffix of Object.keys(CRM_HOST_MAP)) {
    if (host.endsWith(suffix)) return CRM_HOST_MAP[suffix];
  }
  return 'generic_crm';
}

function isAllowedHost(hostname, settings) {
  const host = String(hostname || '').toLowerCase();
  const suffixes = Array.isArray(settings.allowedHostSuffixes) ? settings.allowedHostSuffixes : [];
  if (!host) return false;
  if (suffixes.some((s) => host.endsWith(String(s || '').toLowerCase()))) return true;
  return settings.allowUnknownCrmHosts === true;
}

function toDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function toE164(phone, defaultCountryCode) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${toDigits(raw)}`;
  const digits = toDigits(raw);
  if (!digits) return '';
  const cc = String(defaultCountryCode || '+91').replace(/[^\d+]/g, '') || '+91';
  return `${cc.startsWith('+') ? cc : `+${cc}`}${digits}`;
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  merged.allowedHostSuffixes = Array.isArray(merged.allowedHostSuffixes)
    ? merged.allowedHostSuffixes.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SETTINGS.allowedHostSuffixes;
  return merged;
}

async function postPublic(path, settings, payload) {
  const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey
    },
    body: JSON.stringify(payload || {})
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = data?.error || `HTTP ${response.status}`;
    throw new Error(error);
  }
  return data;
}

async function appendLog(entry) {
  const now = new Date().toISOString();
  const record = { at: now, ...entry };
  const existing = await chrome.storage.local.get({ callnestLogs: [] });
  const logs = Array.isArray(existing.callnestLogs) ? existing.callnestLogs : [];
  logs.unshift(record);
  await chrome.storage.local.set({ callnestLogs: logs.slice(0, 200) });
}

async function upsertContactForCall(phoneE164, context, settings) {
  const payload = {
    external_crm: context.crmCode,
    default_country_code: settings.defaultCountryCode,
    contacts: [
      {
        external_id: context.externalContactId || `ext_${toDigits(phoneE164)}`,
        display_name: context.contactName || `CRM Contact ${phoneE164}`,
        phone: phoneE164,
        notes: `Captured from ${context.pageUrl || context.hostname || 'CRM page'}`
      }
    ]
  };
  return postPublic('/api/public/v1/dialer/contacts/upsert', settings, payload);
}

async function clickToCall(phoneE164, context, settings) {
  const payload = {
    external_crm: context.crmCode,
    external_contact_id: context.externalContactId || `ext_${toDigits(phoneE164)}`,
    phone_e164: phoneE164,
    provider: settings.provider || 'exotel',
    notes: `Click-to-call from browser extension (${context.crmCode})`
  };
  return postPublic('/api/public/v1/dialer/calls/click-to-call', settings, payload);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CALLNEST_LOG') {
    appendLog({
      level: message.payload?.level || 'info',
      event: message.payload?.event || 'client.log',
      details: message.payload?.details || {}
    }).catch(() => {});
    return false;
  }

  if (message?.type !== 'CALLNEST_DIAL') return false;

  (async () => {
    const settings = await getSettings();
    if (!settings.apiKey) {
      sendResponse({ ok: false, error: 'Missing API key in extension settings.' });
      return;
    }
    const tabUrl = sender?.tab?.url || message.payload?.pageUrl || '';
    const hostname = (() => {
      try {
        return new URL(tabUrl).hostname;
      } catch {
        return '';
      }
    })();
    const crmCode = detectCrmFromHost(hostname);
    if (!isAllowedHost(hostname, settings)) {
      sendResponse({
        ok: false,
        error: `Host not allowed: ${hostname || 'unknown'}. Add it in extension settings.`
      });
      await appendLog({
        level: 'warn',
        event: 'dial.host_blocked',
        details: { hostname, crmCode }
      });
      return;
    }
    const phoneE164 = toE164(message.payload?.phone, settings.defaultCountryCode);
    if (!phoneE164) {
      sendResponse({ ok: false, error: 'Invalid phone number.' });
      await appendLog({
        level: 'warn',
        event: 'dial.invalid_phone',
        details: { input: message.payload?.phone || null, hostname }
      });
      return;
    }

    const context = {
      crmCode,
      hostname,
      pageUrl: tabUrl,
      externalContactId: message.payload?.externalContactId || null,
      contactName: message.payload?.contactName || null
    };

    if (settings.autoUpsertBeforeCall) {
      await upsertContactForCall(phoneE164, context, settings);
    }
    const callResponse = await clickToCall(phoneE164, context, settings);
    await appendLog({
      level: 'info',
      event: 'dial.success',
      details: { crmCode, hostname, phoneE164 }
    });
    sendResponse({ ok: true, crmCode, phoneE164, call: callResponse?.data || callResponse });
  })().catch((err) => {
    appendLog({
      level: 'error',
      event: 'dial.failed',
      details: { message: err?.message || 'Dial failed', page: sender?.tab?.url || null }
    }).catch(() => {});
    sendResponse({ ok: false, error: err?.message || 'Dial failed' });
  });

  return true;
});
