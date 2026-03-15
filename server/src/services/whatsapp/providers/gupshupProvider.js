/**
 * Gupshup WhatsApp provider.
 * Account mapping: external_account_id = app_name (source number identifier), api_key = api_key.
 * Template: template id from Gupshup; params = body parameters array.
 */
const GUPSHUP_BASE = 'https://api.gupshup.io/wa/api/v1';
const GUPSHUP_BASE_SM = 'https://api.gupshup.io/sm/api/v1/apps';

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/\D/g, '');
}

export async function send(account, phone, templateName, languageCode, bodyParameters = []) {
  const appName = account.external_account_id;
  const apiKey = account.api_key;
  if (!appName || !apiKey) {
    const err = new Error('Gupshup account missing external_account_id (app name) or api_key');
    err.status = 400;
    throw err;
  }

  const source = account.phone_number ? normalizePhone(account.phone_number) : appName;
  const destination = normalizePhone(phone);

  const templatePayload = {
    id: templateName,
    params: (bodyParameters || []).map((p) => String(p)),
  };

  const body = new URLSearchParams({
    source,
    destination,
    template: JSON.stringify(templatePayload),
  });

  const response = await fetch(`${GUPSHUP_BASE}/template/msg`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
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
    const msg = responseBody?.message || responseBody?.error || text;
    const err = new Error(msg || `Gupshup API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }

  const providerMessageId = responseBody?.messageId || responseBody?.message_id || null;
  return { providerMessageId, response: responseBody };
}

export async function sendText(account, phone, messageText) {
  const appName = account.external_account_id;
  const apiKey = account.api_key;
  if (!appName || !apiKey) {
    const err = new Error('Gupshup account missing external_account_id (app name) or api_key');
    err.status = 400;
    throw err;
  }
  const source = account.phone_number ? normalizePhone(account.phone_number) : appName;
  const destination = normalizePhone(phone);
  const message = JSON.stringify({
    type: 'text',
    text: String(messageText || '').slice(0, 4096),
  });
  const body = new URLSearchParams({
    channel: 'whatsapp',
    source,
    destination,
    message,
    'src.name': appName,
  });
  const response = await fetch(`${GUPSHUP_BASE}/msg`, {
    method: 'POST',
    headers: {
      apikey: apiKey,
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
    const msg = responseBody?.message || responseBody?.error || text;
    const err = new Error(msg || `Gupshup API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }
  const providerMessageId = responseBody?.messageId || responseBody?.message_id || null;
  return { providerMessageId, response: responseBody };
}

export async function listTemplates(account) {
  const err = new Error('Fetching template list from Gupshup is not supported. Add templates manually.');
  err.status = 501;
  err.code = 'NOT_SUPPORTED';
  throw err;
}

export async function testConnection(account) {
  const apiKey = account.api_key;
  if (!apiKey) {
    const err = new Error('api_key is required');
    err.status = 400;
    throw err;
  }
  const response = await fetch(`${GUPSHUP_BASE_SM}/app/op/list`, {
    headers: { apikey: apiKey },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = `Connection failed (${response.status})`;
    try {
      const data = JSON.parse(text);
      message = data?.message || data?.error || message;
      if (typeof message === 'object' && message !== null) {
        message = JSON.stringify(message).slice(0, 200);
      }
    } catch {
      if (text) message = text.slice(0, 200);
    }
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return { success: true };
}

