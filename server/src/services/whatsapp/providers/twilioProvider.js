/**
 * Twilio WhatsApp provider.
 * Account mapping: external_account_id = account_sid, api_secret = auth_token.
 * StatusCallback: use account.webhook_url or env WHATSAPP_STATUS_CALLBACK_URL so Twilio POSTs status to our webhook.
 * Template: use ContentSid (template id from Twilio) or map template name to ContentSid.
 */
import { env } from '../../../config/env.js';

const TWILIO_BASE = 'https://api.twilio.com/2010-04-01';
const TWILIO_CONTENT_BASE = 'https://content.twilio.com/v1';

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('91') ? `+${digits}` : `+${digits}`;
}

export async function send(account, phone, templateName, languageCode, bodyParameters = [], options = {}) {
  const accountSid = account.external_account_id;
  const authToken = account.api_secret;
  if (!accountSid || !authToken) {
    const err = new Error('Twilio account missing external_account_id (account_sid) or api_secret (auth_token)');
    err.status = 400;
    throw err;
  }

  const to = normalizePhone(phone);
  const fromNum = account.phone_number?.trim();
  const from = fromNum ? `whatsapp:${fromNum.startsWith('+') ? fromNum : `+${fromNum}`}` : null;
  if (!from) {
    const err = new Error('Twilio account requires phone_number (sandbox/sender number)');
    err.status = 400;
    throw err;
  }

  // Twilio requires ContentSid = Content Template SID from Twilio Content API (starts with "HX")
  const contentSid = (options.provider_template_id || templateName)?.trim();
  if (!contentSid) {
    const err = new Error('Twilio requires Provider template ID (Content SID). Set "Provider template ID" on the template to your Twilio Content SID (e.g. HX...).');
    err.status = 400;
    throw err;
  }
  if (!contentSid.startsWith('HX')) {
    const err = new Error('Twilio ContentSid must be a Twilio Content Template SID (starts with HX). Edit the template and set "Provider template ID" to your Twilio Content SID from the Twilio Console.');
    err.status = 400;
    throw err;
  }

  const contentVariables = {};
  (bodyParameters || []).forEach((val, i) => {
    contentVariables[i + 1] = String(val);
  });

  const statusCallbackUrl = (account.webhook_url || env.whatsappStatusCallbackUrl || '').trim();
  const url = `${TWILIO_BASE}/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: from,
    ContentSid: contentSid,
    ...(Object.keys(contentVariables).length > 0 && {
      ContentVariables: JSON.stringify(contentVariables),
    }),
    ...(statusCallbackUrl && { StatusCallback: statusCallbackUrl }),
  });

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  const text = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { raw: text };
  }

  if (!response.ok) {
    const msg = responseBody?.message || responseBody?.error_message || text;
    const err = new Error(msg || `Twilio API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }

  const providerMessageId = responseBody?.sid || null;
  return { providerMessageId, response: responseBody };
}

export async function sendText(account, phone, messageText) {
  const accountSid = account.external_account_id;
  const authToken = account.api_secret;
  if (!accountSid || !authToken) {
    const err = new Error('Twilio account missing external_account_id (account_sid) or api_secret (auth_token)');
    err.status = 400;
    throw err;
  }
  const fromNum = account.phone_number?.trim();
  const from = fromNum ? `whatsapp:${fromNum.startsWith('+') ? fromNum : `+${fromNum}`}` : null;
  if (!from) {
    const err = new Error('Twilio account requires phone_number (sandbox/sender number)');
    err.status = 400;
    throw err;
  }
  const to = normalizePhone(phone);
  const body = String(messageText || '').slice(0, 1600);
  const statusCallbackUrl = (account.webhook_url || env.whatsappStatusCallbackUrl || '').trim();
  const url = `${TWILIO_BASE}/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: from,
    Body: body,
    ...(statusCallbackUrl && { StatusCallback: statusCallbackUrl }),
  });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const text = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { raw: text };
  }
  if (!response.ok) {
    const msg = responseBody?.message || responseBody?.error_message || text;
    const err = new Error(msg || `Twilio API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }
  const providerMessageId = responseBody?.sid || null;
  return { providerMessageId, response: responseBody };
}

/**
 * List Content API templates (for sync/fetch UI). Returns normalized list for import.
 * Fetches all pages, then tries LegacyContent if Content returns empty (legacy WhatsApp templates).
 */
export async function listTemplates(account) {
  const accountSid = account.external_account_id;
  const authToken = account.api_secret;
  if (!accountSid || !authToken) {
    const err = new Error('Twilio account missing external_account_id (account_sid) or api_secret (auth_token)');
    err.status = 400;
    throw err;
  }
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}` };

  /** Fetch one page and return { contents, nextPageUrl } */
  async function fetchPage(url) {
    const response = await fetch(url, { method: 'GET', headers });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      const msg = body?.message || body?.error_message || text;
      const err = new Error(msg || `Twilio Content API error: ${response.status}`);
      err.status = response.status >= 400 ? response.status : 500;
      err.response = body;
      throw err;
    }
    const contents = body?.contents || [];
    const nextPageUrl = body?.meta?.next_page_url ? new URL(body.meta.next_page_url).pathname + new URL(body.meta.next_page_url).search : null;
    return { contents, nextPageUrl };
  }

  /** Normalize one Content item to our shape */
  function normalize(c) {
    const types = c.types || {};
    const textType = types['twilio/text'];
    const quickReply = types['twilio/quick-reply'];
    const card = types['twilio/card'];
    let bodyText = (textType?.body || quickReply?.body || '').trim();
    if (!bodyText && card?.title) bodyText = card.title;
    return {
      provider_template_id: c.sid,
      template_name: c.friendly_name || c.sid,
      language: c.language || 'en',
      category: 'UTILITY',
      components: [
        { component_type: 'BODY', component_text: bodyText || '', component_order: 1 },
      ],
      _raw: { variables: c.variables, types: c.types },
    };
  }

  let allContents = [];
  let url = `${TWILIO_CONTENT_BASE}/Content?PageSize=100`;
  do {
    const base = 'https://content.twilio.com';
    const fullUrl = url.startsWith('http') ? url : base + url;
    const { contents, nextPageUrl } = await fetchPage(fullUrl);
    allContents = allContents.concat(contents);
    url = nextPageUrl || '';
  } while (url);

  let list = allContents.map(normalize);

  // If no Content API templates, try ContentAndApprovals then LegacyContent
  if (list.length === 0) {
    let approvalsUrl = `${TWILIO_CONTENT_BASE}/ContentAndApprovals?PageSize=100`;
    const base = 'https://content.twilio.com';
    let approvalsContents = [];
    do {
      const res = await fetch(approvalsUrl.startsWith('http') ? approvalsUrl : base + approvalsUrl, { method: 'GET', headers });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
      if (!res.ok) break;
      const chunk = body?.contents || [];
      approvalsContents = approvalsContents.concat(chunk);
      const next = body?.meta?.next_page_url;
      approvalsUrl = next ? (next.startsWith('http') ? next : base + next) : null;
    } while (approvalsUrl);
    if (approvalsContents.length > 0) list = approvalsContents.map(normalize);
  }

  if (list.length === 0) {
    let legacyUrl = `${TWILIO_CONTENT_BASE}/LegacyContent?PageSize=100`;
    let legacyContents = [];
    do {
      const res = await fetch(legacyUrl.startsWith('http') ? legacyUrl : 'https://content.twilio.com' + legacyUrl, { method: 'GET', headers });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
      if (!res.ok) break;
      const chunk = body?.contents || body?.legacy_contents || [];
      legacyContents = legacyContents.concat(chunk);
      const next = body?.meta?.next_page_url;
      legacyUrl = next ? (next.startsWith('http') ? next : 'https://content.twilio.com' + next) : null;
    } while (legacyUrl);
    list = legacyContents.map((c) => ({
      provider_template_id: c.content_sid || c.sid,
      template_name: c.friendly_name || c.name || c.sid,
      language: (c.language || 'en').split(/[_-]/)[0],
      category: 'UTILITY',
      components: [
        { component_type: 'BODY', component_text: c.body_text || c.text || '', component_order: 1 },
      ],
      _raw: {},
    }));
  }

  return list;
}

export async function testConnection(account) {
  const accountSid = account.external_account_id;
  const authToken = account.api_secret;
  if (!accountSid || !authToken) {
    const err = new Error('external_account_id (account_sid) and api_secret (auth_token) are required');
    err.status = 400;
    throw err;
  }
  const url = `${TWILIO_BASE}/Accounts/${accountSid}.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const response = await fetch(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = `Connection failed (${response.status})`;
    try {
      const data = JSON.parse(text);
      message = data?.message || data?.error_message || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return { success: true };
}
