import { query, withConnection } from '../../config/db.js';
import { startCallForContact } from './callsService.js';

function normalizeIds(arr, max = 200) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(0, max);
}

export async function createSession(
  tenantId,
  user,
  { contact_ids = [], provider = 'dummy', dialing_set_id = null, call_script_id = null } = {}
) {
  const ids = normalizeIds(contact_ids, 500);
  if (ids.length === 0) {
    const err = new Error('contact_ids must be a non-empty array');
    err.status = 400;
    throw err;
  }

  const dialingSetId = dialing_set_id ? String(dialing_set_id).trim() : null;
  const callScriptId = call_script_id === null || call_script_id === '' ? null : Number(call_script_id);

  const result = await query(
    `INSERT INTO dialer_sessions (
       tenant_id, created_by_user_id, provider, status, started_at, ended_at, paused_at, paused_seconds, dialing_set_id, call_script_id
     ) VALUES (?, ?, ?, 'ready', NULL, NULL, NULL, 0, ?, ?)`,
    [tenantId, user.id, String(provider || 'dummy'), dialingSetId, callScriptId]
  );
  const sessionId = result.insertId;

  // Insert queued items in given order
  for (let i = 0; i < ids.length; i++) {
    const cid = ids[i];
    await query(
      `INSERT IGNORE INTO dialer_session_items (tenant_id, session_id, contact_id, order_index, state)
       VALUES (?, ?, ?, ?, 'queued')`,
      [tenantId, sessionId, cid, i]
    );
  }

  return getSession(tenantId, user, sessionId);
}

export async function getSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  if (!sid) return null;

  const [sess] = await query(
    `SELECT id, tenant_id, created_by_user_id, provider, status, started_at, ended_at, paused_at, paused_seconds, dialing_set_id, call_script_id, created_at
     FROM dialer_sessions
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, sid]
  );
  if (!sess) return null;

  // Agents/managers can only see their own sessions for now
  if (user.role !== 'admin' && Number(sess.created_by_user_id) !== Number(user.id)) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }

  const items = await query(
    `SELECT
        dsi.id,
        dsi.contact_id,
        dsi.order_index,
        dsi.state,
        dsi.last_attempt_id,
        dsi.last_error,
        dsi.called_at,
        c.display_name,
        c.primary_phone_id,
        p.phone AS primary_phone,
        cca.is_connected AS attempt_is_connected,
        cca.status AS attempt_status,
        cca.disposition_id AS attempt_disposition_id
     FROM dialer_session_items dsi
     LEFT JOIN contacts c ON c.id = dsi.contact_id AND c.tenant_id = dsi.tenant_id
     LEFT JOIN contact_phones p ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN contact_call_attempts cca ON cca.id = dsi.last_attempt_id AND cca.tenant_id = dsi.tenant_id
     WHERE dsi.tenant_id = ? AND dsi.session_id = ?
     ORDER BY dsi.order_index ASC, dsi.id ASC`,
    [tenantId, sid]
  );

  // Dialing set dispositions (buttons) for this session
  let dispositions = [];
  if (sess.dialing_set_id) {
    dispositions = await query(
      `SELECT
          d.id,
          d.name,
          d.code,
          d.next_action,
          d.is_connected
       FROM dialing_set_dispositions dsd
       INNER JOIN dispositions d
         ON d.id = dsd.disposition_id AND d.tenant_id = dsd.tenant_id AND d.is_deleted = 0
       WHERE dsd.tenant_id = ? AND dsd.dialing_set_id = ?
       ORDER BY dsd.order_index ASC`,
      [tenantId, String(sess.dialing_set_id)]
    );
  }

  // Call script body (rendered in UI with variables)
  let script = null;
  if (sess.call_script_id) {
    const [srow] = await query(
      `SELECT id, script_name, script_body
       FROM call_scripts
       WHERE tenant_id = ? AND id = ? AND is_deleted = 0
       LIMIT 1`,
      [tenantId, Number(sess.call_script_id)]
    );
    script = srow || null;
  }

  return { ...sess, items, dispositions, script };
}

async function pickNextQueuedItem(tenantId, sessionId) {
  const [row] = await query(
    `SELECT id, contact_id
     FROM dialer_session_items
     WHERE tenant_id = ? AND session_id = ? AND state = 'queued'
     ORDER BY order_index ASC, id ASC
     LIMIT 1`,
    [tenantId, sessionId]
  );
  return row || null;
}

export async function callNextInSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  if (!sid) {
    const err = new Error('Invalid session id');
    err.status = 400;
    throw err;
  }

  // Serialize all "next dial" work per session (double-clicks, StrictMode, parallel tabs).
  const lockName = `cn_dn_${tenantId}_${sid}`.slice(0, 64);
  return withConnection(async (conn) => {
    const [lr] = await conn.query('SELECT GET_LOCK(?, 25) AS g', [lockName]);
    const got = Number(lr?.[0]?.g);
    if (got !== 1) {
      const err = new Error('Another dial action is in progress for this session. Please wait.');
      err.status = 409;
      throw err;
    }
    try {
      return await runCallNextAfterLock(tenantId, user, sid);
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?) AS r', [lockName]);
    }
  });
}

async function runCallNextAfterLock(tenantId, user, sid) {
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status === 'paused') {
    const err = new Error('Session is paused');
    err.status = 400;
    throw err;
  }
  if (session.status !== 'active' && session.status !== 'ready') {
    const err = new Error('Session is not active');
    err.status = 400;
    throw err;
  }
  if (session.status === 'ready') {
    await query(
      `UPDATE dialer_sessions
       SET status = 'active', started_at = COALESCE(started_at, NOW())
       WHERE tenant_id = ? AND id = ? AND status = 'ready'`,
      [tenantId, sid]
    );
  }

  const [activeCalling] = await query(
    `SELECT id FROM dialer_session_items
     WHERE tenant_id = ? AND session_id = ? AND state = 'calling'
     LIMIT 1`,
    [tenantId, sid]
  );
  if (activeCalling) {
    const err = new Error('Finish the current call (set a disposition) before dialing the next lead.');
    err.status = 400;
    throw err;
  }

  const next = await pickNextQueuedItem(tenantId, sid);
  if (!next) {
    await query(
      `UPDATE dialer_sessions SET status = 'completed', ended_at = NOW()
       WHERE tenant_id = ? AND id = ? AND status IN ('active','ready')`,
      [tenantId, sid]
    );
    return { done: true, attempt: null, session: await getSession(tenantId, user, sid) };
  }

  await query(
    `UPDATE dialer_session_items
     SET state = 'calling', called_at = NULL
     WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
    [tenantId, next.id]
  );

  try {
    const attempt = await startCallForContact(tenantId, user, {
      contact_id: next.contact_id,
      provider: session.provider || 'dummy',
      notes: `dialer_session:${sid}`,
    });
    await query(
      `UPDATE dialer_session_items
       SET state = 'calling', last_attempt_id = ?, last_error = NULL, called_at = NULL
       WHERE tenant_id = ? AND id = ?`,
      [attempt.id, tenantId, next.id]
    );
    return { done: false, attempt, session: await getSession(tenantId, user, sid) };
  } catch (e) {
    await query(
      `UPDATE dialer_session_items
       SET state = 'failed', last_error = ?
       WHERE tenant_id = ? AND id = ?`,
      [String(e?.message || 'Call failed').slice(0, 255), tenantId, next.id]
    );
    return { done: false, attempt: null, error: e?.message || 'Call failed', session: await getSession(tenantId, user, sid) };
  }
}

export async function cancelSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  await query(
    `UPDATE dialer_sessions SET status = 'cancelled', ended_at = NOW()
     WHERE tenant_id = ? AND id = ?`,
    [tenantId, sid]
  );
  return getSession(tenantId, user, sid);
}

export async function pauseSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status === 'completed' || session.status === 'cancelled') return session;
  if (session.status === 'paused') return session;

  await query(
    `UPDATE dialer_sessions
     SET status = 'paused', paused_at = NOW()
     WHERE tenant_id = ? AND id = ? AND status IN ('ready','active')`,
    [tenantId, sid]
  );
  return getSession(tenantId, user, sid);
}

export async function resumeSession(tenantId, user, sessionId) {
  const sid = Number(sessionId);
  const session = await getSession(tenantId, user, sid);
  if (!session) {
    const err = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.status !== 'paused') return session;

  await query(
    `UPDATE dialer_sessions
     SET
       status = 'active',
       paused_seconds = paused_seconds + GREATEST(0, TIMESTAMPDIFF(SECOND, paused_at, NOW())),
       paused_at = NULL
     WHERE tenant_id = ? AND id = ? AND status = 'paused'`,
    [tenantId, sid]
  );
  return getSession(tenantId, user, sid);
}

