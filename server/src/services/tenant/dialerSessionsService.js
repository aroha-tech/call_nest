import { query, withConnection } from '../../config/db.js';
import { startCallForContact } from './callsService.js';
import { enrichDispositionsForDialerSession } from './dispositionApplyDealHelper.js';

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

  const uid = user?.id != null ? Number(user.id) : null;
  const [nextRow] = await query(
    `SELECT COALESCE(MAX(user_session_no), 0) + 1 AS next_no
     FROM dialer_sessions
     WHERE tenant_id = ? AND created_by_user_id <=> ?`,
    [tenantId, uid]
  );
  const userSessionNo = Math.max(1, Number(nextRow?.next_no) || 1);

  const result = await query(
    `INSERT INTO dialer_sessions (
       tenant_id, created_by_user_id, user_session_no, provider, status, started_at, ended_at, paused_at, paused_seconds, dialing_set_id, call_script_id
     ) VALUES (?, ?, ?, ?, 'ready', NULL, NULL, NULL, 0, ?, ?)`,
    [tenantId, uid, userSessionNo, String(provider || 'dummy'), dialingSetId, callScriptId]
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
    `SELECT id, tenant_id, created_by_user_id, user_session_no, provider, status, started_at, ended_at, paused_at, paused_seconds, dialing_set_id, call_script_id, created_at
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
        dsi.contact_phone_id,
        dsi.order_index,
        dsi.state,
        dsi.last_attempt_id,
        dsi.last_error,
        dsi.called_at,
        c.display_name,
        c.primary_phone_id,
        p.phone AS primary_phone,
        p_pick.phone AS selected_phone,
        cca.contact_phone_id AS attempt_contact_phone_id,
        p_att.phone AS attempt_phone,
        cca.is_connected AS attempt_is_connected,
        cca.status AS attempt_status,
        cca.disposition_id AS attempt_disposition_id
     FROM dialer_session_items dsi
     LEFT JOIN contacts c ON c.id = dsi.contact_id AND c.tenant_id = dsi.tenant_id
     LEFT JOIN contact_phones p ON p.id = c.primary_phone_id AND p.tenant_id = c.tenant_id
     LEFT JOIN contact_phones p_pick
       ON p_pick.id = dsi.contact_phone_id AND p_pick.tenant_id = dsi.tenant_id
     LEFT JOIN contact_call_attempts cca ON cca.id = dsi.last_attempt_id AND cca.tenant_id = dsi.tenant_id
     LEFT JOIN contact_phones p_att
       ON p_att.id = cca.contact_phone_id AND p_att.tenant_id = dsi.tenant_id
     WHERE dsi.tenant_id = ? AND dsi.session_id = ?
     ORDER BY dsi.order_index ASC, dsi.id ASC`,
    [tenantId, sid]
  );

  // Dialing set dispositions (buttons) for this session
  let dispositions = [];
  if (sess.dialing_set_id) {
    const rawDispos = await query(
      `SELECT
          d.id,
          d.name,
          d.code,
          d.next_action,
          d.is_connected,
          d.actions
       FROM dialing_set_dispositions dsd
       INNER JOIN dispositions d
         ON d.id = dsd.disposition_id AND d.tenant_id = dsd.tenant_id AND d.is_deleted = 0
       WHERE dsd.tenant_id = ? AND dsd.dialing_set_id = ?
       ORDER BY dsd.order_index ASC`,
      [tenantId, String(sess.dialing_set_id)]
    );
    dispositions = await enrichDispositionsForDialerSession(tenantId, rawDispos);
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
    `SELECT id, contact_id, contact_phone_id
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

  // Set state = calling and last_attempt_id together after the attempt row exists.
  // (A prior two-step update left rows in state calling with NULL last_attempt_id, which
  // disabled disposition buttons until the client refetched.)
  try {
    const attempt = await startCallForContact(tenantId, user, {
      contact_id: next.contact_id,
      contact_phone_id: next.contact_phone_id != null ? next.contact_phone_id : null,
      provider: session.provider || 'dummy',
    });
    await query(
      `UPDATE dialer_session_items
       SET state = 'calling', last_attempt_id = ?, last_error = NULL, called_at = NULL
       WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
      [attempt.id, tenantId, next.id]
    );
    return { done: false, attempt, session: await getSession(tenantId, user, sid) };
  } catch (e) {
    await query(
      `UPDATE dialer_session_items
       SET state = 'failed', last_error = ?
       WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
      [String(e?.message || 'Call failed').slice(0, 255), tenantId, next.id]
    );
    return { done: false, attempt: null, error: e?.message || 'Call failed', session: await getSession(tenantId, user, sid) };
  }
}

/**
 * After disposition with next_action = next_number: dial the next phone on the same queue item,
 * or complete the item and advance to the next contact (same lock as call next).
 */
export async function handleNextNumberDisposition(tenantId, user, attemptId) {
  const aid = Number(attemptId);
  if (!aid || !Number.isFinite(aid)) {
    const err = new Error('Invalid attempt id');
    err.status = 400;
    throw err;
  }

  const probeRows = await query(
    `SELECT session_id
     FROM dialer_session_items
     WHERE tenant_id = ? AND last_attempt_id = ? AND state = 'calling'
     LIMIT 1`,
    [tenantId, aid]
  );
  const probe = probeRows[0];
  if (!probe) {
    return {
      skipped: true,
      auto_dialed: false,
      done: false,
      attempt: null,
      session: null,
    };
  }

  const sid = Number(probe.session_id);

  return withConnection(async (conn) => {
    const lockName = `cn_dn_${tenantId}_${sid}`.slice(0, 64);
    const [lr] = await conn.query('SELECT GET_LOCK(?, 25) AS g', [lockName]);
    const got = Number(lr?.[0]?.g);
    if (got !== 1) {
      const err = new Error('Another dial action is in progress for this session. Please wait.');
      err.status = 409;
      throw err;
    }
    try {
      const rows = await query(
        `SELECT dsi.id AS item_id,
                dsi.session_id,
                dsi.contact_id,
                dsi.contact_phone_id,
                ds.status AS sess_status
         FROM dialer_session_items dsi
         INNER JOIN dialer_sessions ds
           ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id
         WHERE dsi.tenant_id = ? AND dsi.last_attempt_id = ? AND dsi.state = 'calling'
         LIMIT 1`,
        [tenantId, aid]
      );
      const itemRow = rows[0];
      if (!itemRow) {
        return {
          skipped: true,
          auto_dialed: false,
          done: false,
          attempt: null,
          session: await getSession(tenantId, user, sid),
        };
      }

      const [attemptRow] = await query(
        `SELECT contact_phone_id FROM contact_call_attempts WHERE tenant_id = ? AND id = ? LIMIT 1`,
        [tenantId, aid]
      );
      const apid = attemptRow?.contact_phone_id;
      const attemptPhoneId =
        apid != null && String(apid) !== '' ? Number(apid) : null;

      const phones = await query(
        `SELECT id, phone, label, is_primary
         FROM contact_phones
         WHERE tenant_id = ? AND contact_id = ?
         ORDER BY is_primary DESC, id ASC`,
        [tenantId, itemRow.contact_id]
      );

      let nextIdx;
      if (attemptPhoneId != null && Number.isFinite(attemptPhoneId) && attemptPhoneId > 0) {
        const idx = phones.findIndex((p) => Number(p.id) === attemptPhoneId);
        nextIdx = idx >= 0 ? idx + 1 : phones.length;
      } else {
        nextIdx = phones.length > 0 ? 1 : 0;
      }

      const nextPhone = phones[nextIdx];

      if (!nextPhone) {
        await query(
          `UPDATE dialer_session_items
           SET state = 'called', called_at = NOW()
           WHERE tenant_id = ? AND id = ? AND last_attempt_id = ? AND state = 'calling'`,
          [tenantId, itemRow.item_id, aid]
        );
        const dial = await runCallNextAfterLock(tenantId, user, sid);
        return {
          skipped: false,
          auto_dialed: Boolean(dial?.attempt?.id),
          done: Boolean(dial?.done),
          attempt: dial?.attempt ?? null,
          session: dial?.session ?? (await getSession(tenantId, user, sid)),
        };
      }

      await query(
        `UPDATE dialer_session_items
         SET state = 'queued',
             last_attempt_id = NULL,
             called_at = NULL,
             contact_phone_id = ?
         WHERE tenant_id = ? AND id = ? AND last_attempt_id = ? AND state = 'calling'`,
        [nextPhone.id, tenantId, itemRow.item_id, aid]
      );

      if (String(itemRow.sess_status || '').toLowerCase() === 'paused') {
        return {
          skipped: false,
          auto_dialed: false,
          done: false,
          attempt: null,
          session: await getSession(tenantId, user, sid),
        };
      }

      const dial = await runCallNextAfterLock(tenantId, user, sid);
      return {
        skipped: false,
        auto_dialed: Boolean(dial?.attempt?.id),
        done: Boolean(dial?.done),
        attempt: dial?.attempt ?? null,
        session: dial?.session ?? (await getSession(tenantId, user, sid)),
      };
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?) AS r', [lockName]);
    }
  });
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

export async function updateSessionItemTargetPhone(
  tenantId,
  user,
  sessionId,
  itemId,
  { contact_phone_id: phoneIdRaw = null } = {}
) {
  const sid = Number(sessionId);
  const iid = Number(itemId);
  if (!sid || !iid) {
    const err = new Error('Invalid session or item id');
    err.status = 400;
    throw err;
  }

  await getSession(tenantId, user, sid);

  const phoneId =
    phoneIdRaw === null || phoneIdRaw === undefined || phoneIdRaw === ''
      ? null
      : Number(phoneIdRaw);
  if (phoneId !== null && (!Number.isFinite(phoneId) || phoneId <= 0)) {
    const err = new Error('Invalid contact_phone_id');
    err.status = 400;
    throw err;
  }

  const [item] = await query(
    `SELECT id, contact_id, state FROM dialer_session_items WHERE tenant_id = ? AND session_id = ? AND id = ? LIMIT 1`,
    [tenantId, sid, iid]
  );
  if (!item) {
    const err = new Error('Queue item not found');
    err.status = 404;
    throw err;
  }
  if (item.state !== 'queued') {
    const err = new Error('You can only change the target number while this lead is queued.');
    err.status = 400;
    throw err;
  }

  if (phoneId) {
    const [ph] = await query(
      `SELECT id FROM contact_phones WHERE tenant_id = ? AND contact_id = ? AND id = ? LIMIT 1`,
      [tenantId, item.contact_id, phoneId]
    );
    if (!ph) {
      const err = new Error('Phone does not belong to this contact');
      err.status = 400;
      throw err;
    }
  }

  await query(
    `UPDATE dialer_session_items SET contact_phone_id = ? WHERE tenant_id = ? AND id = ? AND state = 'queued'`,
    [phoneId, tenantId, iid]
  );
  return getSession(tenantId, user, sid);
}

