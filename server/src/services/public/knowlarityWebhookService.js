import { query } from '../../config/db.js';

function normalizeKnowlarityStatus(payload = {}) {
  const raw = String(
    payload.status ||
      payload.call_status ||
      payload.CallStatus ||
      payload.event ||
      ''
  )
    .trim()
    .toLowerCase();

  if (!raw) return 'queued';
  if (['queued', 'initiated', 'ringing', 'inprogress', 'in-progress'].includes(raw)) return 'ringing';
  if (['answered', 'connected', 'completed', 'success'].includes(raw)) return 'completed';
  if (['busy'].includes(raw)) return 'busy';
  if (['no-answer', 'noanswer', 'not_answered', 'notanswered', 'unanswered'].includes(raw)) return 'no_answer';
  if (['failed', 'error', 'cancelled', 'canceled'].includes(raw)) return 'failed';
  return raw;
}

function parseDuration(payload = {}) {
  const val = payload.duration ?? payload.call_duration ?? payload.CallDuration ?? null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function pickProviderCallId(payload = {}) {
  return String(
    payload.call_id ||
      payload.CallSid ||
      payload.call_sid ||
      payload.ucid ||
      payload.id ||
      ''
  ).trim();
}

export async function handleKnowlarityStatusCallback(payload = {}) {
  const providerCallId = pickProviderCallId(payload);
  if (!providerCallId) {
    const err = new Error('Missing call id in Knowlarity webhook payload');
    err.status = 400;
    throw err;
  }
  const status = normalizeKnowlarityStatus(payload);
  const durationSec = parseDuration(payload);

  const [attempt] = await query(
    `SELECT id, tenant_id
     FROM contact_call_attempts
     WHERE provider = 'knowlarity'
       AND provider_call_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [providerCallId]
  );
  if (!attempt) return { matched: false, provider_call_id: providerCallId, status };

  const finished = ['completed', 'failed', 'no_answer', 'busy'].includes(status);
  await query(
    `UPDATE contact_call_attempts
     SET status = ?,
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

