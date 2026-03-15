/**
 * Orchestrator: load account, resolve provider, call adapter, persist message and logs.
 * Does not depend on tenantId for provider logic; tenantId is used for DB and logging.
 */
import * as whatsappAccountService from '../tenant/whatsappAccountService.js';
import * as whatsappBusinessTemplateService from '../tenant/whatsappBusinessTemplateService.js';
import * as whatsappMessageService from '../tenant/whatsappMessageService.js';
import * as whatsappApiLogService from '../tenant/whatsappApiLogService.js';
import * as metaProvider from './providers/metaProvider.js';
import * as twilioProvider from './providers/twilioProvider.js';
import * as gupshupProvider from './providers/gupshupProvider.js';
import * as interaktProvider from './providers/interaktProvider.js';
import * as kaleyraProvider from './providers/kaleyraProvider.js';
import { query } from '../../config/db.js';

const PROVIDERS = {
  meta: metaProvider,
  twilio: twilioProvider,
  gupshup: gupshupProvider,
  interakt: interaktProvider,
  kaleyra: kaleyraProvider,
};

function getProvider(providerName) {
  const key = (providerName || 'meta').toLowerCase();
  const adapter = PROVIDERS[key];
  if (!adapter) {
    const err = new Error(`Unsupported WhatsApp provider: ${providerName}`);
    err.status = 400;
    throw err;
  }
  return adapter;
}

/** Build full message text from HEADER + BODY + FOOTER; bodyParameters[0]=>{{1}}, [1]=>{{2}}, etc. */
function buildTemplateTextFromComponents(template, bodyParameters = []) {
  if (!template?.components || !Array.isArray(template.components)) return '';
  const map = {};
  (bodyParameters || []).forEach((v, idx) => {
    map[String(idx + 1)] = v != null ? String(v) : '';
  });
  const replace = (text) =>
    (text || '').replace(/\{\{(\d+)\}\}/g, (_, n) =>
      map[String(n)] !== undefined ? map[String(n)] : `{{${n}}}`
    );
  const order = ['HEADER', 'BODY', 'FOOTER'];
  const parts = [];
  for (const type of order) {
    const comp = template.components.find((c) => (c.component_type || '').toUpperCase() === type);
    if (comp?.component_text) parts.push(replace(comp.component_text));
  }
  return parts.join('\n').trim();
}

/**
 * Send a WhatsApp template message.
 * @param {number} tenantId
 * @param {object} payload - { whatsapp_account_id, phone, contact_id?, template_id?, template_name?, language?, body_parameters[] }
 * @param {number} createdBy
 * @returns {Promise<object>} whatsapp_messages row
 */
export async function sendWhatsappMessage(tenantId, payload, createdBy) {
  const { whatsapp_account_id, phone, contact_id, template_id, body_parameters = [], force_manual = false } = payload;

  if (!whatsapp_account_id || !phone) {
    const err = new Error('whatsapp_account_id and phone are required');
    err.status = 400;
    throw err;
  }

  const account = await whatsappAccountService.findActiveById(tenantId, whatsapp_account_id);
  if (!account) {
    const err = new Error('WhatsApp account not found or inactive');
    err.status = 400;
    throw err;
  }

  const providerName = (account.provider || 'meta').toLowerCase();

  let templateName = payload.template_name;
  let languageCode = payload.language || 'en';
  let providerTemplateId = payload.provider_template_id || null;
  let template = null;
  if (template_id) {
    template = await whatsappBusinessTemplateService.getTemplateWithComponents(
      tenantId,
      template_id
    );
    if (!template) {
      const err = new Error('Template not found');
      err.status = 404;
      throw err;
    }
    templateName = template.template_name;
    languageCode = template.language || 'en';
    providerTemplateId = template.provider_template_id || null;
  }

  if (!templateName) {
    const err = new Error('template_id or template_name is required');
    err.status = 400;
    throw err;
  }

  // Load tenant automation flag
  const [tenantRow] = await query(
    'SELECT whatsapp_automation_enabled FROM tenants WHERE id = ?',
    [tenantId]
  );
  const automationEnabled = !!tenantRow?.whatsapp_automation_enabled;

  const isTemplateAutomatic =
    template && template.template_mode ? template.template_mode === 'automatic' : true;

  const canUseProvider =
    automationEnabled && isTemplateAutomatic && providerName !== 'manual';
  const shouldUseProvider = canUseProvider && !force_manual;

  // Cooldown check (per contact + template)
  if (template && template_id && (template.cooldown_days || template.cooldown_hours)) {
    const days = Number(template.cooldown_days || 0);
    const hours = Number(template.cooldown_hours || 0);
    const totalMs = (days * 24 + hours) * 60 * 60 * 1000;
    if (totalMs > 0) {
      const since = new Date(Date.now() - totalMs);
      const params = [tenantId, template_id, since];
      let sql =
        'SELECT id FROM whatsapp_messages WHERE tenant_id = ? AND template_id = ? AND created_at >= ?';
      if (contact_id) {
        sql += ' AND contact_id = ?';
        params.push(contact_id);
      } else if (phone) {
        sql += ' AND phone = ?';
        params.push(phone);
      }
      sql += ' LIMIT 1';
      const [row] = await query(sql, params);
      if (row) {
        const err = new Error(
          'This template was already sent recently to this contact (cooldown active).'
        );
        err.status = 429;
        throw err;
      }
    }
  }

  // For manual path, pre-build text and wa.me link
  let manualText = null;
  let manualLink = null;
  if (!shouldUseProvider) {
    if (template) {
      manualText = buildTemplateTextFromComponents(template, body_parameters);
    }
    const digits = String(phone || '').replace(/\D/g, '');
    manualLink = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(manualText || '')}`
      : null;
  }

  const messageRecord = await whatsappMessageService.create(
    tenantId,
    {
      whatsapp_account_id,
      provider: shouldUseProvider ? providerName : null,
      contact_id: contact_id || null,
      phone,
      template_id: template_id || null,
      message_text: shouldUseProvider ? null : manualText,
      status: 'pending',
      send_mode: shouldUseProvider ? 'automatic' : 'manual',
    },
    createdBy
  );

  let responseStatus = null;
  let responseBody = null;
  let errorMessage = null;
  let providerMessageId = null;

  if (!shouldUseProvider) {
    // Manual mode: mark as sent and set sent_at (user will send via wa.me link)
    await whatsappMessageService.updateStatus(tenantId, messageRecord.id, 'sent', {
      sent_at: new Date(),
    });
    return {
      ...(await whatsappMessageService.findById(tenantId, messageRecord.id)),
      wa_link: manualLink,
    };
  }

  const adapter = getProvider(providerName);

  try {
    const result = await adapter.send(account, phone, templateName, languageCode, body_parameters, {
      provider_template_id: providerTemplateId,
    });
    providerMessageId = result.providerMessageId;
    responseBody = result.response;
    responseStatus = 200;

    await whatsappApiLogService.create(tenantId, {
      whatsapp_account_id,
      direction: 'outbound',
      endpoint: '(provider)',
      method: 'POST',
      request_body: { templateName, languageCode, body_parameters: body_parameters?.length },
      response_status: responseStatus,
      response_body: responseBody,
    });

    await whatsappMessageService.updateStatus(tenantId, messageRecord.id, 'sent', {
      provider_message_id: providerMessageId,
      sent_at: new Date(),
    });

    return whatsappMessageService.findById(tenantId, messageRecord.id);
  } catch (err) {
    errorMessage = err.message;
    if (err.response) responseBody = err.response;
    await whatsappApiLogService.create(tenantId, {
      whatsapp_account_id,
      direction: 'outbound',
      endpoint: '(provider)',
      method: 'POST',
      request_body: { templateName, languageCode, body_parameters: body_parameters?.length },
      response_status: responseStatus || err.status || 500,
      response_body: responseBody,
      error_message: errorMessage,
    });
    await whatsappMessageService.updateStatus(tenantId, messageRecord.id, 'failed');
    throw err;
  }
}

/**
 * Send a free-form text message (no template). Allowed within 24h session window; provider may reject if outside.
 * @param {number} tenantId
 * @param {object} payload - { whatsapp_account_id, phone, contact_id?, message_text }
 * @param {number} createdBy
 * @returns {Promise<object>} whatsapp_messages row
 */
export async function sendWhatsappTextMessage(tenantId, payload, createdBy) {
  const { whatsapp_account_id, phone, contact_id, message_text } = payload;

  if (!whatsapp_account_id || !phone) {
    const err = new Error('whatsapp_account_id and phone are required');
    err.status = 400;
    throw err;
  }
  const text = String(message_text ?? '').trim();
  if (!text) {
    const err = new Error('message_text is required');
    err.status = 400;
    throw err;
  }

  const account = await whatsappAccountService.findActiveById(tenantId, whatsapp_account_id);
  if (!account) {
    const err = new Error('WhatsApp account not found or inactive');
    err.status = 400;
    throw err;
  }

  const providerName = (account.provider || 'meta').toLowerCase();
  const adapter = getProvider(providerName);
  if (!adapter.sendText) {
    const err = new Error(`Provider ${providerName} does not support free-form text messages`);
    err.status = 400;
    throw err;
  }

  const messageRecord = await whatsappMessageService.create(tenantId, {
    whatsapp_account_id,
    provider: providerName,
    contact_id: contact_id || null,
    phone,
    template_id: null,
    message_text: text,
    status: 'pending',
  }, createdBy);

  let responseStatus = null;
  let responseBody = null;
  let errorMessage = null;
  let providerMessageId = null;

  try {
    const result = await adapter.sendText(account, phone, text);
    providerMessageId = result.providerMessageId;
    responseBody = result.response;
    responseStatus = 200;

    await whatsappApiLogService.create(tenantId, {
      whatsapp_account_id,
      direction: 'outbound',
      endpoint: '(provider)',
      method: 'POST',
      request_body: { type: 'text', message_text_length: text.length },
      response_status: responseStatus,
      response_body: responseBody,
    });

    await whatsappMessageService.updateStatus(tenantId, messageRecord.id, 'sent', {
      provider_message_id: providerMessageId,
      sent_at: new Date(),
    });

    return whatsappMessageService.findById(tenantId, messageRecord.id);
  } catch (err) {
    errorMessage = err.message;
    if (err.response) responseBody = err.response;
    await whatsappApiLogService.create(tenantId, {
      whatsapp_account_id,
      direction: 'outbound',
      endpoint: '(provider)',
      method: 'POST',
      request_body: { type: 'text', message_text_length: text.length },
      response_status: responseStatus || err.status || 500,
      response_body: responseBody,
      error_message: errorMessage,
    });
    await whatsappMessageService.updateStatus(tenantId, messageRecord.id, 'failed');
    throw err;
  }
}

export function getProviderAdapter(providerName) {
  return getProvider(providerName);
}

export async function testConnection(tenantId, accountId, credentials = null) {
  let account;
  if (credentials) {
    account = { provider: credentials.provider, api_key: credentials.api_key, api_secret: credentials.api_secret, external_account_id: credentials.external_account_id, phone_number: credentials.phone_number };
  } else {
    account = await whatsappAccountService.findById(tenantId, accountId);
    if (!account) {
      const err = new Error('WhatsApp account not found');
      err.status = 404;
      throw err;
    }
  }
  const adapter = getProvider(account.provider);
  return adapter.testConnection(account);
}

/**
 * Fetch template list from provider (Twilio Content API, Meta message_templates, etc.).
 * @param {number} tenantId
 * @param {number} whatsapp_account_id
 * @param {object} options - { waba_id } for Meta (WhatsApp Business Account ID)
 * @returns {Promise<Array>} List of { provider_template_id, template_name, language, category, components }
 */
export async function listTemplatesFromProvider(tenantId, whatsapp_account_id, options = {}) {
  const account = await whatsappAccountService.findActiveById(tenantId, whatsapp_account_id);
  if (!account) {
    const err = new Error('WhatsApp account not found or inactive');
    err.status = 404;
    throw err;
  }
  const adapter = getProvider(account.provider);
  if (!adapter.listTemplates) {
    const err = new Error(`Provider ${account.provider} does not support listing templates`);
    err.status = 501;
    throw err;
  }
  const list = await adapter.listTemplates(account, { waba_id: options.waba_id });
  return list.map((t) => {
    const { _raw, ...rest } = t;
    return rest;
  });
}
