import { query } from '../../config/db.js';

function trimStr(v) {
  if (v == null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/**
 * Log a CRM timeline row (e.g. manual profile save). List APIs should exclude soft-deleted rows.
 */
export async function insertContactActivityEvent(
  tenantId,
  {
    contactId,
    eventType,
    actorUserId = null,
    summary = null,
    payloadJson = null,
    refCallAttemptId = null,
    refDialerSessionId = null,
    refWhatsappMessageId = null,
    refEmailMessageId = null,
    refOpportunityId = null,
    refAssignmentHistoryId = null,
    refImportBatchId = null,
  } = {}
) {
  const cid = Number(contactId);
  if (!Number.isFinite(cid) || cid <= 0) return;
  const type = trimStr(eventType);
  if (!type) return;
  await query(
    `INSERT INTO contact_activity_events (
       tenant_id, contact_id, event_type, actor_user_id, summary, payload_json,
       ref_call_attempt_id, ref_dialer_session_id, ref_whatsapp_message_id, ref_email_message_id,
       ref_opportunity_id, ref_assignment_history_id, ref_import_batch_id,
       created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      cid,
      type,
      actorUserId ?? null,
      summary ? String(summary).slice(0, 500) : null,
      payloadJson != null ? JSON.stringify(payloadJson) : null,
      refCallAttemptId ?? null,
      refDialerSessionId ?? null,
      refWhatsappMessageId ?? null,
      refEmailMessageId ?? null,
      refOpportunityId ?? null,
      refAssignmentHistoryId ?? null,
      refImportBatchId ?? null,
      actorUserId ?? null,
    ]
  );
}

export async function listContactActivityEvents(tenantId, contactId) {
  const cid = Number(contactId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  return query(
    `SELECT e.*, u.name AS actor_name
     FROM contact_activity_events e
     LEFT JOIN users u ON u.id = e.actor_user_id AND u.tenant_id = e.tenant_id AND u.is_deleted = 0
     WHERE e.tenant_id = ? AND e.contact_id = ? AND e.deleted_at IS NULL
     ORDER BY e.created_at ASC`,
    [tenantId, cid]
  );
}
