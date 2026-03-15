/**
 * Kaleyra WhatsApp provider.
 * Account mapping: external_account_id = sid, api_key = api-key.
 * API: POST https://api.in.kaleyra.io/v2/<sid>/whatsapp/<phone>/messages
 */
const KALEYRA_BASE = 'https://api.in.kaleyra.io';

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/\D/g, '');
}

export async function send(account, phone, templateName, languageCode, bodyParameters = []) {
  const sid = account.external_account_id;
  const apiKey = account.api_key;
  if (!sid || !apiKey) {
    const err = new Error('Kaleyra account missing external_account_id (sid) or api_key');
    err.status = 400;
    throw err;
  }

  const to = normalizePhone(phone);
  const from = account.phone_number ? normalizePhone(account.phone_number) : null;
  if (!from) {
    const err = new Error('Kaleyra account requires phone_number (business number)');
    err.status = 400;
    throw err;
  }

  const template = {
    name: templateName,
    language: { code: languageCode || 'en' },
  };
  if (bodyParameters && bodyParameters.length > 0) {
    template.components = [
      { type: 'body', parameters: bodyParameters.map((text) => ({ type: 'text', text: String(text) })) },
    ];
  }

  const requestBody = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template,
  };

  const url = `${KALEYRA_BASE}/v2/${sid}/whatsapp/${from}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
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
    const msg = responseBody?.message || responseBody?.error || text;
    const err = new Error(msg || `Kaleyra API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }

  const providerMessageId = responseBody?.messages?.[0]?.id || responseBody?.id || null;
  return { providerMessageId, response: responseBody };
}

export async function sendText(account, phone, messageText) {
  const sid = account.external_account_id;
  const apiKey = account.api_key;
  if (!sid || !apiKey) {
    const err = new Error('Kaleyra account missing external_account_id (sid) or api_key');
    err.status = 400;
    throw err;
  }
  const to = normalizePhone(phone);
  const from = account.phone_number ? normalizePhone(account.phone_number) : null;
  if (!from) {
    const err = new Error('Kaleyra account requires phone_number (business number)');
    err.status = 400;
    throw err;
  }
  const requestBody = {
    messaging_object: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: 'false',
        body: String(messageText || '').slice(0, 4096),
      },
    },
  };
  const url = `${KALEYRA_BASE}/v2/${sid}/whatsapp/${from}/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
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
    const msg = responseBody?.message || responseBody?.error || text;
    const err = new Error(msg || `Kaleyra API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }
  const providerMessageId = responseBody?.data?.message_id || responseBody?.messages?.[0]?.id || responseBody?.id || null;
  return { providerMessageId, response: responseBody };
}

export async function listTemplates(account) {
  const err = new Error('Fetching template list from Kaleyra is not supported. Add templates manually.');
  err.status = 501;
  err.code = 'NOT_SUPPORTED';
  throw err;
}

export async function testConnection(account) {
  const sid = account.external_account_id;
  const apiKey = account.api_key;
  if (!sid || !apiKey) {
    const err = new Error('external_account_id (sid) and api_key are required');
    err.status = 400;
    throw err;
  }
  const url = `${KALEYRA_BASE}/v2/${sid}/whatsapp`;
  const response = await fetch(url, {
    headers: { 'api-key': apiKey },
  });
  if (response.status === 401 || response.status === 403) {
    const err = new Error('Invalid credentials');
    err.status = 400;
    throw err;
  }
  return { success: true };
}
