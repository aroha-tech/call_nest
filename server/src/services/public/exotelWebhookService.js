import { query } from '../../config/db.js';

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
  if (['answered', 'connected', 'completed', 'completed_success', 'completedsuccess'].includes(raw)) return 'completed';
  if (['busy'].includes(raw)) return 'busy';
  if (['no-answer', 'noanswer', 'not_answered', 'notanswered', 'unanswered'].includes(raw)) return 'no_answer';
  if (['failed', 'error', 'canceled', 'cancelled'].includes(raw)) return 'failed';
  return raw;
}

function parseDuration(payload = {}) {
  const val = payload.CallDuration ?? payload.Duration ?? payload.duration ?? null;
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
  )
    .trim();
}

export async function handleExotelStatusCallback(payload = {}) {
  const providerCallId = pickProviderCallId(payload);
  if (!providerCallId) {
    const err = new Error('Missing CallSid/CallUUID in Exotel webhook payload');
    err.status = 400;
    throw err;
  }
  const status = normalizeExotelStatus(payload);
  const durationSec = parseDuration(payload);

  const [attempt] = await query(
    `SELECT id, tenant_id
     FROM contact_call_attempts
     WHERE provider = 'exotel'
       AND provider_call_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [providerCallId]
  );
  if (!attempt) {
    return { matched: false, provider_call_id: providerCallId, status };
  }

  const finished = ['completed', 'failed', 'no_answer', 'busy'].includes(status);
  await query(
    `UPDATE contact_call_attempts
     SET
      status = ?,
      ended_at = CASE WHEN ? THEN COALESCE(ended_at, UTC_TIMESTAMP()) ELSE ended_at END,
      duration_sec = CASE WHEN ? IS NOT NULL THEN ? ELSE duration_sec END
     WHERE id = ? AND tenant_id = ?`,
    [status, finished, durationSec, durationSec ?? 0, attempt.id, attempt.tenant_id]
  );

  return {
    matched: true,
    attempt_id: attempt.id,
    tenant_id: attempt.tenant_id,
    provider_call_id: providerCallId,
    status,
    duration_sec: durationSec,
  };
}
