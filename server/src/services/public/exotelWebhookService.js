import { query } from '../../config/db.js';
import { normalizeAttemptStatusForDb } from '../tenant/callsService.js';

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

export async function handleExotelStatusCallback(payload = {}) {
  const providerCallId = pickProviderCallId(payload);
  if (!providerCallId) {
    const err = new Error('Missing CallSid/CallUUID in Exotel webhook payload');
    err.status = 400;
    throw err;
  }
  const status = normalizeAttemptStatusForDb('exotel', normalizeExotelStatus(payload));
  const durationSec = parseDuration(payload);
  const recordingUrl = pickRecordingUrl(payload);

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

  return {
    matched: true,
    attempt_id: attempt.id,
    tenant_id: attempt.tenant_id,
    provider_call_id: providerCallId,
    status,
    duration_sec: durationSec,
    recording_url: recordingUrl || undefined,
  };
}
