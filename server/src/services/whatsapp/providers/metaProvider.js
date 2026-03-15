/**
 * Meta Cloud API (Facebook) WhatsApp provider.
 * Account mapping: external_account_id = phone_number_id, api_key = access_token.
 */
const META_API_BASE = 'https://graph.facebook.com/v18.0';

function normalizePhone(phone) {
  if (!phone) return null;
  return String(phone).replace(/\D/g, '');
}

export async function send(account, phone, templateName, languageCode, bodyParameters = []) {
  const phoneNumberId = account.external_account_id;
  const accessToken = account.api_key;
  if (!phoneNumberId || !accessToken) {
    const err = new Error('Meta account missing external_account_id (phone_number_id) or api_key (access_token)');
    err.status = 400;
    throw err;
  }

  const to = normalizePhone(phone);
  const template = {
    name: templateName,
    language: { code: languageCode || 'en' },
  };
  if (bodyParameters && bodyParameters.length > 0) {
    template.components = [
      { type: 'body', parameters: bodyParameters.map((text) => ({ type: 'text', text: String(text) })) },
    ];
  }

  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const requestBody = {
    messaging_product: 'whatsapp',
    type: 'template',
    template,
    to,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
    const msg = responseBody?.error?.message || responseBody?.error?.error_user_msg || text;
    const err = new Error(msg || `Meta API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }

  const providerMessageId = responseBody?.messages?.[0]?.id || null;
  return { providerMessageId, response: responseBody };
}

export async function sendText(account, phone, messageText) {
  const phoneNumberId = account.external_account_id;
  const accessToken = account.api_key;
  if (!phoneNumberId || !accessToken) {
    const err = new Error('Meta account missing external_account_id (phone_number_id) or api_key (access_token)');
    err.status = 400;
    throw err;
  }
  const to = normalizePhone(phone);
  const url = `${META_API_BASE}/${phoneNumberId}/messages`;
  const requestBody = {
    messaging_product: 'whatsapp',
    type: 'text',
    text: { body: String(messageText || '').slice(0, 4096) },
    to,
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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
    const msg = responseBody?.error?.message || responseBody?.error?.error_user_msg || text;
    const err = new Error(msg || `Meta API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }
  const providerMessageId = responseBody?.messages?.[0]?.id || null;
  return { providerMessageId, response: responseBody };
}

/**
 * List message templates. Requires options.waba_id (WhatsApp Business Account ID from Meta Business Manager).
 * Our account has external_account_id = phone_number_id; template list is under WABA.
 */
export async function listTemplates(account, options = {}) {
  const wabaId = options.waba_id || account.waba_id;
  if (!wabaId) {
    const err = new Error('Meta template list requires WhatsApp Business Account ID (WABA). Add it in the fetch step or in account settings.');
    err.status = 400;
    err.code = 'META_WABA_REQUIRED';
    throw err;
  }
  const accessToken = account.api_key;
  if (!accessToken) {
    const err = new Error('Meta account missing api_key (access_token)');
    err.status = 400;
    throw err;
  }
  const url = `${META_API_BASE}/${wabaId}/message_templates?fields=name,language,status,category,components`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(text);
  } catch {
    responseBody = { raw: text };
  }
  if (!response.ok) {
    const msg = responseBody?.error?.message || responseBody?.error?.error_user_msg || text;
    const err = new Error(msg || `Meta API error: ${response.status}`);
    err.status = response.status >= 400 ? response.status : 500;
    err.response = responseBody;
    throw err;
  }
  const data = responseBody?.data || [];
  const list = data.map((t) => {
    const components = (t.components || []).map((comp, i) => {
      let component_text = '';
      if (comp.type === 'BODY' && comp.text) component_text = comp.text;
      if (comp.type === 'HEADER' && comp.format === 'TEXT' && comp.text) component_text = comp.text;
      if (comp.type === 'FOOTER' && comp.text) component_text = comp.text;
      return {
        component_type: comp.type || 'BODY',
        component_text,
        component_order: i + 1,
      };
    }).filter((c) => c.component_type);
    if (!components.length) {
      components.push({ component_type: 'BODY', component_text: '', component_order: 1 });
    }
    return {
      provider_template_id: t.id,
      template_name: t.name,
      language: (t.language || 'en').split(/[_-]/)[0] || 'en',
      category: (t.category || 'UTILITY').toUpperCase(),
      components,
      _raw: { status: t.status },
    };
  });
  return list;
}

export async function testConnection(account) {
  const accessToken = account.api_key;
  if (!accessToken) {
    const err = new Error('api_key (access_token) is required');
    err.status = 400;
    throw err;
  }
  const response = await fetch(`${META_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = `Connection failed (${response.status})`;
    try {
      const data = JSON.parse(text);
      message = data?.error?.message || data?.error?.error_user_msg || message;
    } catch {
      if (text) message = text.slice(0, 200);
    }
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return { success: true };
}
