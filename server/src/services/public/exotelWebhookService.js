import { query } from '../../config/db.js';
import { normalizeAttemptStatusForDb } from '../tenant/callsService.js';
import { settleCallAttempt } from '../billing/callCreditsService.js';
import {
  findAccountByAccountSid,
  findAccountByWebhookToken,
} from '../tenant/telephony/tenantTelephonyAccountsService.js';

function normalizeExotelStatus(payload = {}) {
  const raw = String(
    payload.CallStatus ||
      payload.Status ||
      payload.DialCallStatus ||
      payload.dial_call_status ||
      ''
  )
    .trim()
    .toLowerCase();

  if (!raw) return 'queued';
  if (['queued', 'inprogress', 'in-progress', 'ringing', 'initiated'].includes(raw)) return 'ringing';
  if (['answered', 'connected', 'completed', 'completed_success', 'completedsuccess'].includes(raw)) {
    return 'completed';
  }
  if (['busy'].includes(raw)) return 'busy';
  if (['no-answer', 'noanswer', 'not_answered', 'notanswered', 'unanswered'].includes(raw)) return 'no_answer';
  if (['failed', 'error', 'canceled', 'cancelled'].includes(raw)) return 'failed';
  return raw;
}

function parseDuration(payload = {}) {
  const val =
    payload.ConversationDuration ??
    payload.CallDuration ??
    payload.Duration ??
    payload.duration ??
    null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function pickProviderCallId(payload = {}) {
  return String(
    payload.CallSid ||
      payload.CallUUID ||
      payload.call_sid ||
      payload.call_uuid ||
      ''
  ).trim();
}

function pickAccountSid(payload = {}) {
  return String(payload.AccountSid || payload.account_sid || payload.Sid || '').trim();
}

function pickRecordingUrl(payload = {}) {
  const direct = payload.RecordingUrl || payload.recording_url || payload.Recording_URL;
  if (direct != null && String(direct).trim()) return String(direct).trim();
  const legs = payload.Legs || payload.legs;
  if (Array.isArray(legs)) {
    for (const leg of legs) {
      const u = leg?.RecordingUrl || leg?.recording_url;
      if (u != null && String(u).trim()) return String(u).trim();
    }
  }
  return null;
}

/**
 * Resolve which tenant a webhook belongs to. Priority:
 *   1. webhook_token in the URL (most reliable, set by us when starting the call).
 *   2. AccountSid in the webhook payload (fallback when a tenant cannot configure custom URLs).
 * Returns either { account, tenantId } where account is non-null for BYO, or { tenantId: null }
 * meaning the webhook is for a default-account call (lookup by provider_call_id below).
 */
async function resolveTenantForWebhook(webhookToken, payload) {
  if (webhookToken) {
    const account = await findAccountByWebhookToken(webhookToken);
    if (!account) {
      const err = new Error('Unknown Exotel webhook token');
      err.status = 401;
      throw err;
    }
    return { account, tenantId: Number(account.tenant_id) };
  }
  const accountSid = pickAccountSid(payload);
  if (accountSid) {
    const account = await findAccountByAccountSid('exotel', accountSid);
    if (account) {
      return { account, tenantId: Number(account.tenant_id) };
    }
  }
  // Default-account call: tenant will be resolved from the attempt row by provider_call_id.
  return { account: null, tenantId: null };
}

/**
 * Handle an inbound Exotel status callback.
 *
 * @param {object} payload   Exotel's body (JSON or form-encoded; both parsed upstream).
 * @param {object} options
 * @param {string|null} options.webhookToken  The token captured from the URL (`/status/:token`),
 *                                            or null when the legacy global `/status` URL was hit.
 */
export async function handleExotelStatusCallback(payload = {}, { webhookToken = null } = {}) {
  const providerCallId = pickProviderCallId(payload);
  if (!providerCallId) {
    const err = new Error('Missing CallSid/CallUUID in Exotel webhook payload');
    err.status = 400;
    throw err;
  }

  const status = normalizeAttemptStatusForDb('exotel', normalizeExotelStatus(payload));
  const durationSec = parseDuration(payload);
  const recordingUrl = pickRecordingUrl(payload);

  const { account, tenantId: routedTenantId } = await resolveTenantForWebhook(webhookToken, payload);

  // Find the attempt. When we know the tenantId, scope by it to avoid cross-tenant collisions
  // on provider_call_id (Exotel SIDs are unique within an Exotel account; different BYO tenants
  // could theoretically collide on the same call id).
  const lookupParams = routedTenantId
    ? [providerCallId, routedTenantId]
    : [providerCallId];
  const lookupSql = routedTenantId
    ? `SELECT id, tenant_id FROM contact_call_attempts WHERE provider = 'exotel' AND provider_call_id = ? AND tenant_id = ? ORDER BY id DESC LIMIT 1`
    : `SELECT id, tenant_id FROM contact_call_attempts WHERE provider = 'exotel' AND provider_call_id = ? ORDER BY id DESC LIMIT 1`;
  const [attempt] = await query(lookupSql, lookupParams);
  if (!attempt) {
    return { matched: false, provider_call_id: providerCallId, status };
  }

  const finished = ['completed', 'failed', 'no_answer', 'busy'].includes(status);

  const setParts = [
    'status = ?',
    'ended_at = CASE WHEN ? THEN COALESCE(ended_at, UTC_TIMESTAMP()) ELSE ended_at END',
    'duration_sec = CASE WHEN ? IS NOT NULL THEN ? ELSE duration_sec END',
  ];
  const uparams = [status, finished, durationSec, durationSec ?? 0];

  if (status === 'completed') {
    setParts.push('is_connected = 1');
  } else if (['failed', 'no_answer', 'busy'].includes(status)) {
    setParts.push('is_connected = 0');
  }

  if (recordingUrl) {
    setParts.push(
      'recording_url = CASE WHEN ? IS NOT NULL AND CHAR_LENGTH(TRIM(?)) > 0 THEN TRIM(?) ELSE recording_url END'
    );
    uparams.push(recordingUrl, recordingUrl, recordingUrl);
  }

  await query(
    `UPDATE contact_call_attempts SET ${setParts.join(', ')} WHERE id = ? AND tenant_id = ?`,
    [...uparams, attempt.id, attempt.tenant_id]
  );

  // Settle billing on terminal states. Idempotent: settleCallAttempt no-ops if already settled.
  let billing = null;
  if (finished) {
    try {
      billing = await settleCallAttempt(attempt.id);
    } catch (err) {
      console.error('[exotelWebhook] settleCallAttempt failed', {
        attempt_id: attempt.id,
        tenant_id: attempt.tenant_id,
        error: err?.message || err,
      });
    }
  }

  return {
    matched: true,
    attempt_id: attempt.id,
    tenant_id: attempt.tenant_id,
    account_id: account?.id || null,
    provider_call_id: providerCallId,
    status,
    duration_sec: durationSec,
    recording_url: recordingUrl || undefined,
    billing,
  };
}
