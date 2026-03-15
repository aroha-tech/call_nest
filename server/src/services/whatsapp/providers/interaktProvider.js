/**
 * Interakt WhatsApp provider.
 * Account mapping: external_account_id = optional identifier, api_key = API key.
 * API: POST https://api.interakt.ai/v1/public/message/
 * Auth: Basic with API key.
 */
const INTERAKT_BASE = 'https://api.interakt.ai/v1/public';

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('91') ? `91${digits}` : digits;
}

export async function send(account, phone, templateName, languageCode, bodyParameters = []) {
  const apiKey = account.api_key;
  if (!apiKey) {
    const err = new Error('Interakt account missing api_key');
    err.status = 400;
    throw err;
  }

  const destination = normalizePhone(phone);
  const countryCode = '91';

  const requestBody = {
    countryCode: `+${countryCode}`,
    phoneNumber: destination,
    type: 'Template',
    template: {
      name: templateName,
      languageCode: languageCode || 'en',
      bodyValues: (bodyParameters || []).map((p) => String(p)),
    },
  };

  const response = await fetch(`${INTERAKT_BASE}/message/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { raw: text };
  }

  if (!response.ok) {
    const msg = responseBody?.message || responseBody?.detail || text;
    const err = new Error(msg || `Interakt API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }

  const providerMessageId = responseBody?.id || responseBody?.messageId || null;
  return { providerMessageId, response: responseBody };
}

export async function sendText(account, phone, messageText) {
  const apiKey = account.api_key;
  if (!apiKey) {
    const err = new Error('Interakt account missing api_key');
    err.status = 400;
    throw err;
  }
  const destination = normalizePhone(phone);
  const countryCode = '91';
  const requestBody = {
    countryCode: `+${countryCode}`,
    phoneNumber: destination,
    type: 'Text',
    text: {
      body: String(messageText || '').slice(0, 4096),
    },
  };
  const response = await fetch(`${INTERAKT_BASE}/message/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });
  const text = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { raw: text };
  }
  if (!response.ok) {
    const msg = responseBody?.message || responseBody?.detail || text;
    const err = new Error(msg || `Interakt API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }
  const providerMessageId = responseBody?.id || responseBody?.messageId || null;
  return { providerMessageId, response: responseBody };
}

export async function listTemplates(account) {
  const err = new Error('Fetching template list from Interakt is not supported. Add templates manually.');
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
  const response = await fetch(`${INTERAKT_BASE}/track/event/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event: 'ping', userId: 'test' }),
  });
  if (response.status === 401 || response.status === 403) {
    const err = new Error('Invalid API key');
    err.status = 400;
    throw err;
  }
  return { success: true };
}
