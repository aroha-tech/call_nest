import crypto from 'crypto';
import { query } from '../../config/db.js';

function signPayload(secret, payload) {
  return crypto.createHmac('sha256', String(secret || '')).update(payload).digest('hex');
}

export async function enqueueEvent(tenantId, app, { topic, target_url, payload, idempotency_key }, userId = null) {
  const idempotencyKey = String(idempotency_key || '').trim() || `${topic}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const payloadJson = payload && typeof payload === 'object' ? payload : {};
  await query(
    `INSERT INTO integration_event_outbox (
      tenant_id, integration_app_id, topic, idempotency_key, target_url, payload_json, status, max_attempts, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 8, ?, ?)
    ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    [tenantId, app.id, String(topic || 'event').trim(), idempotencyKey, String(target_url || '').trim(), JSON.stringify(payloadJson), userId, userId]
  );
}

export async function processOutboxBatch({ tenantId = null, limit = 25 } = {}) {
  const rows = await query(
    `SELECT
      o.id, o.tenant_id, o.integration_app_id, o.topic, o.idempotency_key, o.target_url, o.payload_json,
      o.attempt_count, o.max_attempts,
      a.webhook_secret
     FROM integration_event_outbox o
     INNER JOIN integration_apps a
       ON a.id = o.integration_app_id
      AND a.tenant_id = o.tenant_id
      AND a.deleted_at IS NULL
     WHERE o.deleted_at IS NULL
       AND o.status IN ('pending', 'failed')
       AND o.next_attempt_at <= UTC_TIMESTAMP()
       ${tenantId ? 'AND o.tenant_id = ?' : ''}
     ORDER BY o.next_attempt_at ASC, o.id ASC
     LIMIT ?`,
    tenantId ? [tenantId, Math.max(1, Math.min(100, Number(limit) || 25))] : [Math.max(1, Math.min(100, Number(limit) || 25))]
  );

  const result = { processed: 0, delivered: 0, failed: 0, dead: 0 };
  for (const row of rows) {
    result.processed += 1;
    await dispatchSingleOutboxEvent(row, result);
  }
  return result;
}

async function dispatchSingleOutboxEvent(row, acc) {
  const started = Date.now();
  const body = JSON.stringify(row.payload_json && typeof row.payload_json === 'object' ? row.payload_json : {});
  const headers = {
    'content-type': 'application/json',
    'x-callnest-topic': row.topic,
    'x-callnest-idempotency-key': row.idempotency_key,
  };
  if (row.webhook_secret) {
    headers['x-callnest-signature'] = signPayload(row.webhook_secret, body);
  }

  let responseStatus = null;
  let responseBodyText = null;
  let success = false;
  try {
    const resp = await fetch(row.target_url, { method: 'POST', headers, body });
    responseStatus = resp.status;
    responseBodyText = await resp.text();
    success = resp.ok;
  } catch (err) {
    responseStatus = 0;
    responseBodyText = err?.message || 'network_error';
  }

  const latencyMs = Date.now() - started;
  const nextAttemptCount = Number(row.attempt_count || 0) + 1;
  const maxAttempts = Number(row.max_attempts || 8);
  const exhausted = nextAttemptCount >= maxAttempts;
  const nextStatus = success ? 'delivered' : exhausted ? 'dead' : 'failed';

  await query(
    `UPDATE integration_event_outbox
     SET
      attempt_count = ?,
      status = ?,
      last_attempt_at = UTC_TIMESTAMP(),
      next_attempt_at = CASE
        WHEN ? THEN UTC_TIMESTAMP()
        ELSE DATE_ADD(UTC_TIMESTAMP(), INTERVAL LEAST(3600, POW(2, LEAST(12, ?)) * 10) SECOND)
      END,
      last_error = ?
     WHERE id = ? AND tenant_id = ?`,
    [nextAttemptCount, nextStatus, success || exhausted, nextAttemptCount, success ? null : responseBodyText, row.id, row.tenant_id]
  );

  await query(
    `INSERT INTO integration_webhook_deliveries (
      tenant_id, integration_app_id, outbox_id, topic, idempotency_key, request_url,
      request_headers_json, request_body_json, response_status, response_body_text, latency_ms,
      delivery_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.tenant_id,
      row.integration_app_id,
      row.id,
      row.topic,
      row.idempotency_key,
      row.target_url,
      JSON.stringify(headers),
      body,
      responseStatus,
      responseBodyText?.slice(0, 60000) ?? null,
      latencyMs,
      success ? 'success' : 'failed',
    ]
  );

  if (success) acc.delivered += 1;
  else if (exhausted) acc.dead += 1;
  else acc.failed += 1;
}

export async function listDeliveryLogs(tenantId, appId, { limit = 100 } = {}) {
  return query(
    `SELECT
      id, outbox_id, topic, idempotency_key, request_url, response_status,
      response_body_text, latency_ms, delivery_status, created_at
     FROM integration_webhook_deliveries
     WHERE tenant_id = ?
       AND integration_app_id = ?
       AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT ?`,
    [tenantId, appId, Math.max(1, Math.min(200, Number(limit) || 100))]
  );
}

export async function replayOutboxEvent(tenantId, appId, outboxId, userId = null) {
  const [row] = await query(
    `SELECT id, topic, idempotency_key, target_url, payload_json
     FROM integration_event_outbox
     WHERE id = ? AND tenant_id = ? AND integration_app_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [Number(outboxId), tenantId, appId]
  );
  if (!row) {
    const err = new Error('Outbox event not found');
    err.status = 404;
    throw err;
  }
  await query(
    `INSERT INTO integration_event_outbox (
      tenant_id, integration_app_id, topic, idempotency_key, target_url, payload_json, status, created_by, updated_by
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      tenantId,
      appId,
      row.topic,
      `${row.idempotency_key}:replay:${Date.now()}`,
      row.target_url,
      JSON.stringify(row.payload_json || {}),
      userId,
      userId,
    ]
  );
}
