import { query } from '../../config/db.js';
import * as contactsService from '../tenant/contactsService.js';
import * as callsService from '../tenant/callsService.js';
import * as crmMappingService from './crmMappingService.js';
import * as eventOutboxService from './eventOutboxService.js';
import { getDefaultTelephonyProviderCode } from '../tenant/telephony/telephonyProviderRegistry.js';

function pickLeads(payload = {}) {
  if (Array.isArray(payload.contacts)) return payload.contacts;
  if (Array.isArray(payload.leads)) return payload.leads;
  return [];
}

function normalizeExternalId(lead) {
  return String(
    lead?.external_id ??
      lead?.externalId ??
      lead?.id ??
      ''
  )
    .trim();
}

function normalizeLeadPhone(lead, defaultCountryCode = '+91') {
  const raw =
    lead?.phone ??
    lead?.mobile ??
    lead?.phone_number ??
    lead?.primary_phone ??
    lead?.contact_number ??
    '';
  const v = String(raw || '').trim();
  if (!v) return '';
  const digits = v.replace(/\D/g, '');
  if (!digits) return '';
  if (v.startsWith('+')) return `+${digits}`;
  const cc = String(defaultCountryCode || '+91').replace(/[^\d+]/g, '') || '+91';
  return `${cc.startsWith('+') ? cc : `+${cc}`}${digits}`;
}

function normalizeContext(context = {}) {
  const tenantId = Number(context.tenantId);
  const appId = Number(context.appId);
  return {
    tenantId,
    appId: Number.isFinite(appId) && appId > 0 ? appId : null,
    providerCode: String(context.providerCode || 'custom').trim().toLowerCase(),
    user:
      context.user ||
      ({
        id: null,
        tenantId,
        role: 'admin',
      }),
    source: String(context.source || 'crm_public_api').trim() || 'crm_public_api',
  };
}

export async function upsertContacts(context, payload = {}) {
  const ctx = normalizeContext(context);
  const leads = pickLeads(payload);
  if (!leads.length) {
    const err = new Error('contacts/leads array is required');
    err.status = 400;
    throw err;
  }
  const data = await contactsService.upsertLeadsFromIntegration(ctx.tenantId, ctx.user, {
    leads,
    defaultCountryCode: payload.default_country_code || '+91',
    integrationCreatedSource: ctx.source,
  });

  if (ctx.appId && payload.external_crm) {
    // Build mapping directly from the submitted leads because upsert service returns counts only.
    for (const lead of leads) {
      const externalId = normalizeExternalId(lead);
      if (!externalId) continue;
      const phone = normalizeLeadPhone(lead, payload.default_country_code || '+91');
      if (!phone) continue;
      const [row] = await query(
        `SELECT c.id
         FROM contacts c
         INNER JOIN contact_phones p
           ON p.contact_id = c.id
          AND p.tenant_id = c.tenant_id
         WHERE c.tenant_id = ?
           AND c.deleted_at IS NULL
           AND p.phone = ?
         ORDER BY c.id DESC
         LIMIT 1`,
        [ctx.tenantId, phone]
      );
      const internalId = row?.id ? Number(row.id) : null;
      if (!internalId) continue;
      await crmMappingService.upsertEntityMapping(
        ctx.tenantId,
        ctx.appId,
        {
          external_crm: payload.external_crm,
          entity_type: 'contact',
          external_id: externalId,
          internal_id: internalId,
        },
        ctx.user?.id ?? null
      );
    }
  }
  return data;
}

export async function clickToCall(context, payload = {}) {
  const ctx = normalizeContext(context);
  let contactId = payload.contact_id ? Number(payload.contact_id) : null;
  if (!contactId && payload.external_contact_id && ctx.appId) {
    contactId = await crmMappingService.getInternalId(
      ctx.tenantId,
      ctx.appId,
      payload.external_crm || ctx.providerCode,
      'contact',
      payload.external_contact_id
    );
  }
  if (!contactId && payload.phone_e164) {
    const [row] = await query(
      `SELECT c.id
       FROM contacts c
       INNER JOIN contact_phones p
         ON p.contact_id = c.id
        AND p.tenant_id = c.tenant_id
       WHERE c.tenant_id = ?
         AND c.deleted_at IS NULL
         AND p.phone = ?
       ORDER BY c.id DESC
       LIMIT 1`,
      [ctx.tenantId, String(payload.phone_e164).trim()]
    );
    if (row?.id) contactId = Number(row.id);
  }
  if (!contactId) {
    const err = new Error('contact_id or external_contact_id is required');
    err.status = 400;
    throw err;
  }

  const data = await callsService.startCallForContact(ctx.tenantId, ctx.user, {
    contact_id: contactId,
    provider: payload.provider || getDefaultTelephonyProviderCode(),
    notes: payload.notes || null,
  });

  if (payload.callback_url && ctx.appId) {
    await eventOutboxService.enqueueEvent(
      ctx.tenantId,
      { id: ctx.appId, tenant_id: ctx.tenantId, webhook_secret: payload.webhook_secret || null },
      {
        topic: 'call.started',
        target_url: payload.callback_url,
        idempotency_key: `call.started:${data.id}`,
        payload: { call_attempt_id: data.id, provider_call_id: data.provider_call_id, status: data.status },
      },
      ctx.user?.id ?? null
    );
  }

  await query(
    `INSERT INTO tenant_billing_usage_daily (tenant_id, usage_date, metric_key, metric_value)
     VALUES (?, UTC_DATE(), 'api_calls_started', 1)
     ON DUPLICATE KEY UPDATE metric_value = metric_value + 1, updated_at = CURRENT_TIMESTAMP`,
    [ctx.tenantId]
  );

  return data;
}

export async function upsertCallLifecycle(context, payload = {}) {
  const ctx = normalizeContext(context);
  const providerCallId = String(payload.provider_call_id || '').trim();
  const status = String(payload.status || '').trim().toLowerCase();
  if (!providerCallId || !status) {
    const err = new Error('provider_call_id and status are required');
    err.status = 400;
    throw err;
  }
  await query(
    `UPDATE contact_call_attempts
     SET status = ?, ended_at = CASE WHEN ? IN ('completed', 'failed', 'no_answer', 'busy') THEN COALESCE(ended_at, UTC_TIMESTAMP()) ELSE ended_at END,
         duration_sec = CASE WHEN ? IS NOT NULL THEN ? ELSE duration_sec END
     WHERE tenant_id = ? AND provider_call_id = ?`,
    [status, status, payload.duration_sec ?? null, Number(payload.duration_sec) || 0, ctx.tenantId, providerCallId]
  );
  return { provider_call_id: providerCallId, status };
}

export async function writeActivity(context, payload = {}) {
  const ctx = normalizeContext(context);
  const attemptId = Number(payload.call_attempt_id);
  if (!Number.isFinite(attemptId) || attemptId <= 0) {
    const err = new Error('call_attempt_id is required');
    err.status = 400;
    throw err;
  }
  const updated = await callsService.updateAttemptNotesOnly(ctx.tenantId, ctx.user, attemptId, {
    notes: payload.notes ?? null,
  });
  if (payload.disposition_id) {
    await callsService.setAttemptDisposition(ctx.tenantId, ctx.user, attemptId, {
      disposition_id: payload.disposition_id,
      note: payload.notes || null,
    });
  }
  return updated;
}
