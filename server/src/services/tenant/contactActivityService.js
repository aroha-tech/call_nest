import { Buffer } from 'node:buffer';
import { query } from '../../config/db.js';
import { getContactById } from './contactsService.js';
import { listCallAttempts } from './callsService.js';
import { listOpportunitiesForContact } from './opportunitiesService.js';
import { findAll, getCreatedByUserIdsForScope, isMessageVisibleToUser } from './whatsappMessageService.js';
import { isEmailMessageVisibleToUser } from './emailMessageService.js';
import { listContactActivityEvents } from './contactActivityEventsService.js';

function hasPerm(user, code) {
  return Array.isArray(user?.permissions) && user.permissions.includes(code);
}

function toIso(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function sortMs(v) {
  if (!v) return 0;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function baseRefs(contactId) {
  const cid = Number(contactId);
  return {
    contact_id: Number.isFinite(cid) && cid > 0 ? cid : null,
    call_attempt_id: null,
    dialer_session_id: null,
    dialer_session_item_id: null,
    whatsapp_message_id: null,
    email_message_id: null,
    opportunity_id: null,
    assignment_history_id: null,
    import_batch_id: null,
    tag_assignment_id: null,
    stored_event_id: null,
  };
}

function parsePayloadJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

const CALL_ACTIVITY_PAGE_SIZE = 100;
const CALL_ACTIVITY_MAX_PAGES = 25;
const TIMELINE_CURSOR_PAGE_CAP = 80;

/** Higher rank = newer when timestamps tie (feed is newest first). */
const TIMELINE_TYPE_RANK = {
  call_attempt: 1000,
  whatsapp_message: 900,
  email_message: 890,
  profile_updated: 850,
  assignment_changed: 700,
  tag_applied: 600,
  tag_removed: 590,
  dialer_session_position_called: 560,
  dialer_session_queued: 550,
  opportunity_updated: 520,
  opportunity_created: 510,
  contact_created: 100,
};

function msToMysqlDatetime(ms) {
  if (ms == null || !Number.isFinite(Number(ms))) return null;
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function rankForTimelineType(type) {
  return TIMELINE_TYPE_RANK[type] ?? 840;
}

function tieIdFromRefs(ev) {
  const r = ev.refs || {};
  if (r.call_attempt_id) return Number(r.call_attempt_id);
  if (r.stored_event_id) return Number(r.stored_event_id);
  if (r.assignment_history_id) return Number(r.assignment_history_id);
  if (r.tag_assignment_id) return Number(r.tag_assignment_id);
  if (r.dialer_session_item_id) return Number(r.dialer_session_item_id);
  if (r.whatsapp_message_id) return Number(r.whatsapp_message_id);
  if (r.email_message_id) return Number(r.email_message_id);
  if (r.opportunity_id) return Number(r.opportunity_id);
  if (r.contact_id) return Number(r.contact_id);
  return 0;
}

/** True if event should appear after `cursor` in a newest-first feed (strictly older than cursor). */
function isStrictlyOlderThanCursor(ms, type, tieId, cursor) {
  if (!cursor) return true;
  const rank = rankForTimelineType(type);
  if (ms < cursor.ms) return true;
  if (ms > cursor.ms) return false;
  const cRank = rankForTimelineType(cursor.type);
  if (rank < cRank) return true;
  if (rank > cRank) return false;
  return tieId < cursor.id;
}

function encodeTimelineCursor(state) {
  try {
    return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
  } catch {
    return null;
  }
}

function decodeTimelineCursor(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  try {
    const j = JSON.parse(Buffer.from(String(raw).trim(), 'base64url').toString('utf8'));
    if (j && Number.isFinite(Number(j.ms))) {
      return { ms: Number(j.ms), type: String(j.ty || ''), id: Number(j.id) || 0 };
    }
  } catch {
    // ignore
  }
  return null;
}

function cursorPayloadFromEvent(ev) {
  return {
    ms: sortMs(ev.at),
    ty: ev.type,
    id: tieIdFromRefs(ev),
  };
}

async function getCallsActivityMeta(tenantId, user, cid) {
  const res = await listCallAttempts(tenantId, user, {
    contact_id: cid,
    meaningful_only: false,
    page: 1,
    limit: 1,
    sort_by: 'started_at',
    sort_dir: 'desc',
  });
  const total = Number(res.pagination?.total ?? 0);
  const callsTruncated = total > CALL_ACTIVITY_PAGE_SIZE * CALL_ACTIVITY_MAX_PAGES;
  return {
    calls: [],
    callsPagination: res.pagination,
    callsTruncated,
  };
}

async function listAllCallAttemptsForContactActivity(tenantId, user, contactId) {
  const cid = Number(contactId);
  const merged = [];
  let total = 0;
  let page = 1;
  let totalPages = 1;
  do {
    const res = await listCallAttempts(tenantId, user, {
      contact_id: cid,
      meaningful_only: false,
      page,
      limit: CALL_ACTIVITY_PAGE_SIZE,
      sort_by: 'started_at',
      sort_dir: 'desc',
    });
    merged.push(...(res.data || []));
    total = Number(res.pagination?.total ?? merged.length);
    totalPages = Math.max(1, Number(res.pagination?.totalPages ?? 1));
    page += 1;
  } while (page <= totalPages && page <= CALL_ACTIVITY_MAX_PAGES);
  return {
    data: merged,
    pagination: {
      page: 1,
      limit: merged.length,
      total,
      totalPages: Math.max(1, Math.ceil(total / CALL_ACTIVITY_PAGE_SIZE)),
    },
  };
}

async function loadContactAndEnrichForActivity(tenantId, user, cid) {
  const contact = await getContactById(cid, tenantId, user);
  if (!contact) return null;
  const [enrich] = await query(
    `SELECT csm.name AS status_name, camp.name AS campaign_name,
            mgr.name AS manager_name, ag.name AS assigned_user_name,
            cr.name AS created_by_name, up.name AS updated_by_name
     FROM contacts c
     LEFT JOIN contact_status_master csm ON csm.id = c.status_id AND csm.is_deleted = 0
     LEFT JOIN campaigns camp
       ON camp.id = c.campaign_id AND camp.tenant_id = c.tenant_id AND camp.deleted_at IS NULL
     LEFT JOIN users mgr ON mgr.id = c.manager_id AND mgr.tenant_id = c.tenant_id AND mgr.is_deleted = 0
     LEFT JOIN users ag ON ag.id = c.assigned_user_id AND ag.tenant_id = c.tenant_id AND ag.is_deleted = 0
     LEFT JOIN users cr ON cr.id = c.created_by AND cr.tenant_id = c.tenant_id AND cr.is_deleted = 0
     LEFT JOIN users up ON up.id = c.updated_by AND up.tenant_id = c.tenant_id AND up.is_deleted = 0
     WHERE c.tenant_id = ? AND c.id = ? AND c.deleted_at IS NULL`,
    [tenantId, cid]
  );
  const contactOut = { ...contact, ...(enrich || {}) };
  return { contactOut };
}

function assertValidContactId(contactId) {
  const cid = Number(contactId);
  if (!Number.isFinite(cid) || cid <= 0) {
    const err = new Error('Invalid contact id');
    err.status = 400;
    throw err;
  }
  return cid;
}

/**
 * Lightweight payload for the Activity overview card (no timeline / heavy sources).
 */
export async function getContactActivitySummary(tenantId, user, contactId) {
  const cid = assertValidContactId(contactId);
  const loaded = await loadContactAndEnrichForActivity(tenantId, user, cid);
  if (!loaded) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const opportunities = (await listOpportunitiesForContact(tenantId, user, cid)) || [];
  return {
    contact: loaded.contactOut,
    opportunities,
    whatsappOmitted: !hasPerm(user, 'whatsapp.view'),
    emailOmitted: !hasPerm(user, 'email.view'),
  };
}

async function buildContactActivityTimelineBundle(tenantId, user, cid, contactOut) {
  let importBatchesNearby = [];
  if (String(contactOut.created_source || '') === 'import') {
    importBatchesNearby = await query(
      `SELECT b.id, b.original_filename, b.row_count, b.created_count, b.updated_count, b.created_at,
              u.name AS created_by_name
       FROM contact_import_batches b
       LEFT JOIN users u ON u.id = b.created_by_user_id AND u.tenant_id = b.tenant_id AND u.is_deleted = 0
       WHERE b.tenant_id = ?
         AND b.created_at <= DATE_ADD(?, INTERVAL 2 HOUR)
       ORDER BY b.created_at DESC
       LIMIT 8`,
      [tenantId, contactOut.created_at]
    );
  }

  const assignments = await query(
    `SELECT h.*,
            fm.name AS from_manager_name, tm.name AS to_manager_name,
            fa.name AS from_assigned_name, ta.name AS to_assigned_name,
            cb.name AS changed_by_name,
            fc.name AS from_campaign_name, tc.name AS to_campaign_name
     FROM contact_assignment_history h
     LEFT JOIN users fm
       ON fm.id = h.from_manager_id AND fm.tenant_id = h.tenant_id AND fm.is_deleted = 0
     LEFT JOIN users tm
       ON tm.id = h.to_manager_id AND tm.tenant_id = h.tenant_id AND tm.is_deleted = 0
     LEFT JOIN users fa
       ON fa.id = h.from_assigned_user_id AND fa.tenant_id = h.tenant_id AND fa.is_deleted = 0
     LEFT JOIN users ta
       ON ta.id = h.to_assigned_user_id AND ta.tenant_id = h.tenant_id AND ta.is_deleted = 0
     LEFT JOIN users cb
       ON cb.id = h.changed_by_user_id AND cb.tenant_id = h.tenant_id AND cb.is_deleted = 0
     LEFT JOIN campaigns fc
       ON fc.id = h.from_campaign_id AND fc.tenant_id = h.tenant_id AND fc.deleted_at IS NULL
     LEFT JOIN campaigns tc
       ON tc.id = h.to_campaign_id AND tc.tenant_id = h.tenant_id AND tc.deleted_at IS NULL
     WHERE h.tenant_id = ? AND h.contact_id = ?
     ORDER BY h.created_at ASC`,
    [tenantId, cid]
  );

  const tagAssignmentRows = await query(
    `SELECT cta.id, cta.contact_id, cta.tag_id, cta.created_at, cta.deleted_at,
            cta.created_by, cta.deleted_by,
            t.name AS tag_name,
            uc.name AS assigned_by_name,
            ud.name AS removed_by_name
     FROM contact_tag_assignments cta
     INNER JOIN contact_tags t ON t.id = cta.tag_id AND t.tenant_id = cta.tenant_id
     LEFT JOIN users uc ON uc.id = cta.created_by AND uc.tenant_id = cta.tenant_id AND uc.is_deleted = 0
     LEFT JOIN users ud ON ud.id = cta.deleted_by AND ud.tenant_id = cta.tenant_id AND ud.is_deleted = 0
     WHERE cta.tenant_id = ? AND cta.contact_id = ?
     ORDER BY cta.created_at ASC`,
    [tenantId, cid]
  );

  const dialerItems = await query(
    `SELECT dsi.id, dsi.session_id, dsi.contact_id, dsi.last_attempt_id, dsi.state, dsi.order_index,
            dsi.created_at, dsi.called_at, dsi.last_error,
            ds.status AS session_status, ds.started_at AS session_started_at, ds.ended_at AS session_ended_at,
            su.name AS session_started_by_name
     FROM dialer_session_items dsi
     INNER JOIN dialer_sessions ds ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id
     LEFT JOIN users su ON su.id = ds.created_by_user_id AND su.tenant_id = ds.tenant_id AND su.is_deleted = 0
     WHERE dsi.tenant_id = ? AND dsi.contact_id = ?
     ORDER BY dsi.created_at ASC`,
    [tenantId, cid]
  );

  const callsResult = await listAllCallAttemptsForContactActivity(tenantId, user, cid);
  const callsTruncated =
    Number(callsResult.pagination?.total ?? 0) > (callsResult.data || []).length;

  const attemptIdToSessionItem = new Map();
  for (const di of dialerItems) {
    if (di.last_attempt_id) {
      attemptIdToSessionItem.set(Number(di.last_attempt_id), di);
    }
  }

  let whatsappMessages = [];
  let whatsappOmitted = false;
  if (hasPerm(user, 'whatsapp.view')) {
    const createdByUserIds = await getCreatedByUserIdsForScope(tenantId, user);
    whatsappMessages = await findAll(tenantId, {
      contact_id: cid,
      limit: 300,
      offset: 0,
      createdByUserIds,
    });
  } else {
    whatsappOmitted = true;
  }

  let emailMessages = [];
  let emailOmitted = false;
  if (hasPerm(user, 'email.view')) {
    const rawEmail = await query(
      `SELECT m.*,
              ea.email_address AS account_email,
              et.name AS template_name,
              u.name AS sender_name, u.email AS sender_email
       FROM email_messages m
       LEFT JOIN email_accounts ea ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id
       LEFT JOIN email_module_templates et ON et.id = m.template_id AND et.tenant_id = m.tenant_id
       LEFT JOIN users u ON u.id = m.created_by AND u.tenant_id = m.tenant_id AND u.is_deleted = 0
       WHERE m.tenant_id = ? AND m.contact_id = ?
       ORDER BY COALESCE(m.sent_at, m.received_at, m.created_at) DESC
       LIMIT 300`,
      [tenantId, cid]
    );
    for (const m of rawEmail) {
      if (await isEmailMessageVisibleToUser(tenantId, m, user)) {
        emailMessages.push(m);
      }
    }
  } else {
    emailOmitted = true;
  }

  const opportunities = (await listOpportunitiesForContact(tenantId, user, cid)) || [];

  const storedEvents = await listContactActivityEvents(tenantId, cid);

  const timeline = [];

  const createdRefs = baseRefs(cid);
  if (importBatchesNearby?.[0]?.id) {
    createdRefs.import_batch_id = Number(importBatchesNearby[0].id);
  }
  timeline.push({
    type: 'contact_created',
    at: toIso(contactOut.created_at),
    payload: {
      record_type: contactOut.type,
      created_source: contactOut.created_source,
      created_by_name: contactOut.created_by_name,
      import_batches_nearby: importBatchesNearby || [],
    },
    refs: createdRefs,
  });

  for (const e of storedEvents) {
    const refs = baseRefs(cid);
    refs.stored_event_id = e.id;
    refs.call_attempt_id = e.ref_call_attempt_id ?? null;
    refs.dialer_session_id = e.ref_dialer_session_id ?? null;
    refs.whatsapp_message_id = e.ref_whatsapp_message_id ?? null;
    refs.email_message_id = e.ref_email_message_id ?? null;
    refs.opportunity_id = e.ref_opportunity_id ?? null;
    refs.assignment_history_id = e.ref_assignment_history_id ?? null;
    refs.import_batch_id = e.ref_import_batch_id ?? null;
    timeline.push({
      type: e.event_type,
      at: toIso(e.created_at),
      payload: {
        summary: e.summary,
        actor_name: e.actor_name,
        payload_json: parsePayloadJson(e.payload_json),
      },
      refs,
    });
  }

  for (const h of assignments) {
    const refs = baseRefs(cid);
    refs.assignment_history_id = h.id;
    timeline.push({
      type: 'assignment_changed',
      at: toIso(h.created_at),
      payload: h,
      refs,
    });
  }

  for (const trow of tagAssignmentRows) {
    const refsTag = baseRefs(cid);
    refsTag.tag_assignment_id = trow.id;
    timeline.push({
      type: 'tag_applied',
      at: toIso(trow.created_at),
      payload: {
        tag_name: trow.tag_name,
        tag_id: trow.tag_id,
        assigned_by_name: trow.assigned_by_name,
      },
      refs: refsTag,
    });
    if (trow.deleted_at) {
      const refsRemoved = baseRefs(cid);
      refsRemoved.tag_assignment_id = trow.id;
      timeline.push({
        type: 'tag_removed',
        at: toIso(trow.deleted_at),
        payload: {
          tag_name: trow.tag_name,
          tag_id: trow.tag_id,
          removed_by_name: trow.removed_by_name,
        },
        refs: refsRemoved,
      });
    }
  }

  for (const di of dialerItems) {
    const refsDi = baseRefs(cid);
    refsDi.dialer_session_id = di.session_id;
    refsDi.dialer_session_item_id = di.id;
    if (di.last_attempt_id) refsDi.call_attempt_id = di.last_attempt_id;
    timeline.push({
      type: 'dialer_session_queued',
      at: toIso(di.created_at),
      payload: {
        session_id: di.session_id,
        session_status: di.session_status,
        session_started_by_name: di.session_started_by_name,
        order_index: di.order_index,
        state: di.state,
      },
      refs: refsDi,
    });
    if (di.called_at) {
      const refsCalled = baseRefs(cid);
      refsCalled.dialer_session_id = di.session_id;
      refsCalled.dialer_session_item_id = di.id;
      if (di.last_attempt_id) refsCalled.call_attempt_id = di.last_attempt_id;
      timeline.push({
        type: 'dialer_session_position_called',
        at: toIso(di.called_at),
        payload: {
          session_id: di.session_id,
          state: di.state,
          last_error: di.last_error,
          last_attempt_id: di.last_attempt_id,
        },
        refs: refsCalled,
      });
    }
  }

  for (const row of callsResult.data) {
    const rawT = row.started_at || row.created_at;
    const refs = baseRefs(cid);
    refs.call_attempt_id = row.id;
    if (row.dialer_session_id) refs.dialer_session_id = row.dialer_session_id;
    const linkedItem = attemptIdToSessionItem.get(Number(row.id));
    if (linkedItem) refs.dialer_session_item_id = linkedItem.id;
    timeline.push({
      type: 'call_attempt',
      at: toIso(rawT),
      payload: row,
      refs,
    });
  }

  for (const m of whatsappMessages) {
    const rawT = m.sent_at || m.created_at;
    const refs = baseRefs(cid);
    refs.whatsapp_message_id = m.id;
    timeline.push({
      type: 'whatsapp_message',
      at: toIso(rawT),
      payload: m,
      refs,
    });
  }

  for (const em of emailMessages) {
    const rawT = em.sent_at || em.received_at || em.created_at;
    const refs = baseRefs(cid);
    refs.email_message_id = em.id;
    timeline.push({
      type: 'email_message',
      at: toIso(rawT),
      payload: em,
      refs,
    });
  }

  for (const o of opportunities) {
    const refsO = baseRefs(cid);
    refsO.opportunity_id = o.id;
    timeline.push({
      type: 'opportunity_created',
      at: toIso(o.created_at),
      payload: o,
      refs: refsO,
    });
    const cu = sortMs(o.created_at);
    const uu = sortMs(o.updated_at);
    if (uu > cu + 2000) {
      const refsOu = baseRefs(cid);
      refsOu.opportunity_id = o.id;
      timeline.push({
        type: 'opportunity_updated',
        at: toIso(o.updated_at),
        payload: o,
        refs: refsOu,
      });
    }
  }

  timeline.sort((a, b) => sortMs(b.at) - sortMs(a.at));

  return {
    timeline,
    assignments,
    tagAssignments: tagAssignmentRows,
    dialerSessionItems: dialerItems,
    calls: callsResult.data,
    callsPagination: callsResult.pagination,
    callsTruncated,
    opportunities,
    whatsappMessages,
    whatsappOmitted,
    emailMessages,
    emailOmitted,
    storedEvents,
    importBatchesNearby,
  };
}

/**
 * Paginated timeline (newest first) using keyset cursor — does not rebuild the full merged timeline.
 */
export async function getContactActivityTimelinePage(tenantId, user, contactId, opts = {}) {
  const cid = assertValidContactId(contactId);
  const loaded = await loadContactAndEnrichForActivity(tenantId, user, cid);
  if (!loaded) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const contactOut = loaded.contactOut;
  const limit = Math.min(Math.max(1, Number(opts.limit) || 10), 100);
  const cursor = decodeTimelineCursor(opts.cursor);
  const cap = TIMELINE_CURSOR_PAGE_CAP;
  const iso = cursor ? msToMysqlDatetime(cursor.ms) : null;

  const whatsappOmitted = !hasPerm(user, 'whatsapp.view');
  const emailOmitted = !hasPerm(user, 'email.view');

  const candidates = [];

  let importBatchesNearby = [];
  if (String(contactOut.created_source || '') === 'import') {
    importBatchesNearby = await query(
      `SELECT b.id, b.original_filename, b.row_count, b.created_count, b.updated_count, b.created_at,
              u.name AS created_by_name
       FROM contact_import_batches b
       LEFT JOIN users u ON u.id = b.created_by_user_id AND u.tenant_id = b.tenant_id AND u.is_deleted = 0
       WHERE b.tenant_id = ?
         AND b.created_at <= DATE_ADD(?, INTERVAL 2 HOUR)
       ORDER BY b.created_at DESC
       LIMIT 8`,
      [tenantId, contactOut.created_at]
    );
  }
  {
    const createdRefs = baseRefs(cid);
    if (importBatchesNearby?.[0]?.id) {
      createdRefs.import_batch_id = Number(importBatchesNearby[0].id);
    }
    const ev = {
      type: 'contact_created',
      at: toIso(contactOut.created_at),
      payload: {
        record_type: contactOut.type,
        created_source: contactOut.created_source,
        created_by_name: contactOut.created_by_name,
        import_batches_nearby: importBatchesNearby || [],
      },
      refs: createdRefs,
    };
    if (isStrictlyOlderThanCursor(sortMs(ev.at), ev.type, tieIdFromRefs(ev), cursor)) {
      candidates.push(ev);
    }
  }

  let assignSql = `SELECT h.*,
            fm.name AS from_manager_name, tm.name AS to_manager_name,
            fa.name AS from_assigned_name, ta.name AS to_assigned_name,
            cb.name AS changed_by_name,
            fc.name AS from_campaign_name, tc.name AS to_campaign_name
     FROM contact_assignment_history h
     LEFT JOIN users fm
       ON fm.id = h.from_manager_id AND fm.tenant_id = h.tenant_id AND fm.is_deleted = 0
     LEFT JOIN users tm
       ON tm.id = h.to_manager_id AND tm.tenant_id = h.tenant_id AND tm.is_deleted = 0
     LEFT JOIN users fa
       ON fa.id = h.from_assigned_user_id AND fa.tenant_id = h.tenant_id AND fa.is_deleted = 0
     LEFT JOIN users ta
       ON ta.id = h.to_assigned_user_id AND ta.tenant_id = h.tenant_id AND ta.is_deleted = 0
     LEFT JOIN users cb
       ON cb.id = h.changed_by_user_id AND cb.tenant_id = h.tenant_id AND cb.is_deleted = 0
     LEFT JOIN campaigns fc
       ON fc.id = h.from_campaign_id AND fc.tenant_id = h.tenant_id AND fc.deleted_at IS NULL
     LEFT JOIN campaigns tc
       ON tc.id = h.to_campaign_id AND tc.tenant_id = h.tenant_id AND tc.deleted_at IS NULL
     WHERE h.tenant_id = ? AND h.contact_id = ?`;
  const assignParams = [tenantId, cid];
  if (iso) {
    assignSql += ' AND (h.created_at < ? OR h.created_at = ?)';
    assignParams.push(iso, iso);
  }
  assignSql += ` ORDER BY h.created_at DESC, h.id DESC LIMIT ${cap}`;
  const assignmentRows = await query(assignSql, assignParams);

  for (const h of assignmentRows) {
    const refs = baseRefs(cid);
    refs.assignment_history_id = h.id;
    const ev = {
      type: 'assignment_changed',
      at: toIso(h.created_at),
      payload: h,
      refs,
    };
    if (isStrictlyOlderThanCursor(sortMs(ev.at), ev.type, h.id, cursor)) {
      candidates.push(ev);
    }
  }

  let storedSql = `SELECT e.*, u.name AS actor_name
     FROM contact_activity_events e
     LEFT JOIN users u ON u.id = e.actor_user_id AND u.tenant_id = e.tenant_id AND u.is_deleted = 0
     WHERE e.tenant_id = ? AND e.contact_id = ? AND e.deleted_at IS NULL`;
  const storedParams = [tenantId, cid];
  if (iso) {
    storedSql += ' AND (e.created_at < ? OR e.created_at = ?)';
    storedParams.push(iso, iso);
  }
  storedSql += ` ORDER BY e.created_at DESC, e.id DESC LIMIT ${cap}`;
  const storedRows = await query(storedSql, storedParams);
  for (const e of storedRows) {
    const refs = baseRefs(cid);
    refs.stored_event_id = e.id;
    refs.call_attempt_id = e.ref_call_attempt_id ?? null;
    refs.dialer_session_id = e.ref_dialer_session_id ?? null;
    refs.whatsapp_message_id = e.ref_whatsapp_message_id ?? null;
    refs.email_message_id = e.ref_email_message_id ?? null;
    refs.opportunity_id = e.ref_opportunity_id ?? null;
    refs.assignment_history_id = e.ref_assignment_history_id ?? null;
    refs.import_batch_id = e.ref_import_batch_id ?? null;
    const ev = {
      type: e.event_type,
      at: toIso(e.created_at),
      payload: {
        summary: e.summary,
        actor_name: e.actor_name,
        payload_json: parsePayloadJson(e.payload_json),
      },
      refs,
    };
    if (isStrictlyOlderThanCursor(sortMs(ev.at), ev.type, e.id, cursor)) {
      candidates.push(ev);
    }
  }

  const tagAssignmentRows = await query(
    `SELECT cta.id, cta.contact_id, cta.tag_id, cta.created_at, cta.deleted_at,
            cta.created_by, cta.deleted_by,
            t.name AS tag_name,
            uc.name AS assigned_by_name,
            ud.name AS removed_by_name
     FROM contact_tag_assignments cta
     INNER JOIN contact_tags t ON t.id = cta.tag_id AND t.tenant_id = cta.tenant_id
     LEFT JOIN users uc ON uc.id = cta.created_by AND uc.tenant_id = cta.tenant_id AND uc.is_deleted = 0
     LEFT JOIN users ud ON ud.id = cta.deleted_by AND ud.tenant_id = cta.tenant_id AND ud.is_deleted = 0
     WHERE cta.tenant_id = ? AND cta.contact_id = ?
     ORDER BY cta.created_at ASC`,
    [tenantId, cid]
  );
  for (const trow of tagAssignmentRows) {
    const refsTag = baseRefs(cid);
    refsTag.tag_assignment_id = trow.id;
    const evA = {
      type: 'tag_applied',
      at: toIso(trow.created_at),
      payload: {
        tag_name: trow.tag_name,
        tag_id: trow.tag_id,
        assigned_by_name: trow.assigned_by_name,
      },
      refs: refsTag,
    };
    if (isStrictlyOlderThanCursor(sortMs(evA.at), evA.type, trow.id, cursor)) {
      candidates.push(evA);
    }
    if (trow.deleted_at) {
      const refsRemoved = baseRefs(cid);
      refsRemoved.tag_assignment_id = trow.id;
      const evR = {
        type: 'tag_removed',
        at: toIso(trow.deleted_at),
        payload: {
          tag_name: trow.tag_name,
          tag_id: trow.tag_id,
          removed_by_name: trow.removed_by_name,
        },
        refs: refsRemoved,
      };
      if (isStrictlyOlderThanCursor(sortMs(evR.at), evR.type, trow.id, cursor)) {
        candidates.push(evR);
      }
    }
  }

  const dialerItems = await query(
    `SELECT dsi.id, dsi.session_id, dsi.contact_id, dsi.last_attempt_id, dsi.state, dsi.order_index,
            dsi.created_at, dsi.called_at, dsi.last_error,
            ds.status AS session_status, ds.started_at AS session_started_at, ds.ended_at AS session_ended_at,
            su.name AS session_started_by_name
     FROM dialer_session_items dsi
     INNER JOIN dialer_sessions ds ON ds.id = dsi.session_id AND ds.tenant_id = dsi.tenant_id
     LEFT JOIN users su ON su.id = ds.created_by_user_id AND su.tenant_id = ds.tenant_id AND su.is_deleted = 0
     WHERE dsi.tenant_id = ? AND dsi.contact_id = ?
     ORDER BY dsi.created_at ASC`,
    [tenantId, cid]
  );
  const attemptIdToSessionItem = new Map();
  for (const di of dialerItems) {
    if (di.last_attempt_id) {
      attemptIdToSessionItem.set(Number(di.last_attempt_id), di);
    }
  }
  for (const di of dialerItems) {
    const refsDi = baseRefs(cid);
    refsDi.dialer_session_id = di.session_id;
    refsDi.dialer_session_item_id = di.id;
    if (di.last_attempt_id) refsDi.call_attempt_id = di.last_attempt_id;
    const evQ = {
      type: 'dialer_session_queued',
      at: toIso(di.created_at),
      payload: {
        session_id: di.session_id,
        session_status: di.session_status,
        session_started_by_name: di.session_started_by_name,
        order_index: di.order_index,
        state: di.state,
      },
      refs: refsDi,
    };
    if (isStrictlyOlderThanCursor(sortMs(evQ.at), evQ.type, di.id, cursor)) {
      candidates.push(evQ);
    }
    if (di.called_at) {
      const refsCalled = baseRefs(cid);
      refsCalled.dialer_session_id = di.session_id;
      refsCalled.dialer_session_item_id = di.id;
      if (di.last_attempt_id) refsCalled.call_attempt_id = di.last_attempt_id;
      const evC = {
        type: 'dialer_session_position_called',
        at: toIso(di.called_at),
        payload: {
          session_id: di.session_id,
          state: di.state,
          last_error: di.last_error,
          last_attempt_id: di.last_attempt_id,
        },
        refs: refsCalled,
      };
      if (isStrictlyOlderThanCursor(sortMs(evC.at), evC.type, di.id, cursor)) {
        candidates.push(evC);
      }
    }
  }

  let callCursor;
  if (iso) {
    callCursor =
      cursor?.type === 'call_attempt'
        ? { startedAtIso: iso, attemptId: cursor.id }
        : { startedAtIso: iso, attemptId: null };
  }
  const callsRes = await listCallAttempts(tenantId, user, {
    contact_id: cid,
    meaningful_only: false,
    page: 1,
    limit: cap,
    sort_by: 'started_at',
    sort_dir: 'desc',
    ...(callCursor ? { activity_timeline_cursor: callCursor } : {}),
  });
  for (const row of callsRes.data || []) {
    const rawT = row.started_at || row.created_at;
    const refs = baseRefs(cid);
    refs.call_attempt_id = row.id;
    if (row.dialer_session_id) refs.dialer_session_id = row.dialer_session_id;
    const linkedItem = attemptIdToSessionItem.get(Number(row.id));
    if (linkedItem) refs.dialer_session_item_id = linkedItem.id;
    const ev = {
      type: 'call_attempt',
      at: toIso(rawT),
      payload: row,
      refs,
    };
    if (isStrictlyOlderThanCursor(sortMs(ev.at), ev.type, Number(row.id), cursor)) {
      candidates.push(ev);
    }
  }

  if (hasPerm(user, 'whatsapp.view')) {
    const createdByUserIds = await getCreatedByUserIdsForScope(tenantId, user);
    let waSql = `SELECT m.*, t.template_name, wa.phone_number AS account_phone,
           u.name AS sender_name, u.email AS sender_email
    FROM whatsapp_messages m
    LEFT JOIN whatsapp_business_templates t ON t.id = m.template_id
    LEFT JOIN whatsapp_accounts wa ON wa.id = m.whatsapp_account_id
    LEFT JOIN users u ON u.id = m.created_by AND u.tenant_id = m.tenant_id AND u.is_deleted = 0
    WHERE m.tenant_id = ? AND m.contact_id = ?`;
    const waParams = [tenantId, cid];
    if (createdByUserIds === undefined || createdByUserIds === null) {
      // no scope
    } else if (!Array.isArray(createdByUserIds) || createdByUserIds.length === 0) {
      waSql += ' AND 1=0';
    } else {
      const ph = createdByUserIds.map(() => '?').join(',');
      waSql += ` AND m.created_by IN (${ph})`;
      waParams.push(...createdByUserIds);
    }
    if (iso) {
      waSql += ' AND (COALESCE(m.sent_at, m.created_at) < ? OR COALESCE(m.sent_at, m.created_at) = ?)';
      waParams.push(iso, iso);
    }
    waSql += ` ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC LIMIT ${cap}`;
    const waRows = await query(waSql, waParams);
    for (const m of waRows) {
      const rawT = m.sent_at || m.created_at;
      const refs = baseRefs(cid);
      refs.whatsapp_message_id = m.id;
      const ev = {
        type: 'whatsapp_message',
        at: toIso(rawT),
        payload: m,
        refs,
      };
      if (!isMessageVisibleToUser(tenantId, m, user)) continue;
      if (isStrictlyOlderThanCursor(sortMs(ev.at), ev.type, Number(m.id), cursor)) {
        candidates.push(ev);
      }
    }
  }

  if (hasPerm(user, 'email.view')) {
    let emSql = `SELECT m.*,
              ea.email_address AS account_email,
              et.name AS template_name,
              u.name AS sender_name, u.email AS sender_email
       FROM email_messages m
       LEFT JOIN email_accounts ea ON ea.id = m.email_account_id AND ea.tenant_id = m.tenant_id
       LEFT JOIN email_module_templates et ON et.id = m.template_id AND et.tenant_id = m.tenant_id
       LEFT JOIN users u ON u.id = m.created_by AND u.tenant_id = m.tenant_id AND u.is_deleted = 0
       WHERE m.tenant_id = ? AND m.contact_id = ?`;
    const emParams = [tenantId, cid];
    if (iso) {
      emSql +=
        ' AND (COALESCE(m.sent_at, m.received_at, m.created_at) < ? OR COALESCE(m.sent_at, m.received_at, m.created_at) = ?)';
      emParams.push(iso, iso);
    }
    emSql += ` ORDER BY COALESCE(m.sent_at, m.received_at, m.created_at) DESC, m.id DESC LIMIT ${cap}`;
    const rawEmail = await query(emSql, emParams);
    for (const em of rawEmail) {
      if (!(await isEmailMessageVisibleToUser(tenantId, em, user))) continue;
      const rawT = em.sent_at || em.received_at || em.created_at;
      const refs = baseRefs(cid);
      refs.email_message_id = em.id;
      const ev = {
        type: 'email_message',
        at: toIso(rawT),
        payload: em,
        refs,
      };
      if (isStrictlyOlderThanCursor(sortMs(ev.at), ev.type, Number(em.id), cursor)) {
        candidates.push(ev);
      }
    }
  }

  const opportunities = (await listOpportunitiesForContact(tenantId, user, cid)) || [];
  for (const o of opportunities) {
    const refsO = baseRefs(cid);
    refsO.opportunity_id = o.id;
    const evC = {
      type: 'opportunity_created',
      at: toIso(o.created_at),
      payload: o,
      refs: refsO,
    };
    if (isStrictlyOlderThanCursor(sortMs(evC.at), evC.type, o.id, cursor)) {
      candidates.push(evC);
    }
    const cu = sortMs(o.created_at);
    const uu = sortMs(o.updated_at);
    if (uu > cu + 2000) {
      const refsOu = baseRefs(cid);
      refsOu.opportunity_id = o.id;
      const evU = {
        type: 'opportunity_updated',
        at: toIso(o.updated_at),
        payload: o,
        refs: refsOu,
      };
      if (isStrictlyOlderThanCursor(sortMs(evU.at), evU.type, o.id, cursor)) {
        candidates.push(evU);
      }
    }
  }

  candidates.sort((a, b) => {
    const d = sortMs(b.at) - sortMs(a.at);
    if (d !== 0) return d;
    const r = rankForTimelineType(b.type) - rankForTimelineType(a.type);
    if (r !== 0) return r;
    return tieIdFromRefs(b) - tieIdFromRefs(a);
  });

  const withExtra = candidates.slice(0, limit + 1);
  const hasMore = withExtra.length > limit;
  const timeline = hasMore ? withExtra.slice(0, limit) : withExtra;
  const lastEv = timeline.length > 0 ? timeline[timeline.length - 1] : null;
  const timelineNextCursor =
    hasMore && lastEv ? encodeTimelineCursor(cursorPayloadFromEvent(lastEv)) : null;

  const meta = await getCallsActivityMeta(tenantId, user, cid);

  return {
    timeline,
    timelineNextCursor,
    timelineHasMore: hasMore,
    timelineLimit: limit,
    calls: meta.calls,
    callsPagination: meta.callsPagination,
    callsTruncated: meta.callsTruncated,
    whatsappOmitted,
    emailOmitted,
  };
}

/**
 * Full lead/contact activity: unified timeline with cross-links (calls, dial sessions, email, WhatsApp, etc.).
 */
export async function getContactActivity(tenantId, user, contactId) {
  const cid = assertValidContactId(contactId);
  const loaded = await loadContactAndEnrichForActivity(tenantId, user, cid);
  if (!loaded) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const bundle = await buildContactActivityTimelineBundle(tenantId, user, cid, loaded.contactOut);
  return {
    contact: loaded.contactOut,
    timeline: bundle.timeline,
    assignments: bundle.assignments,
    tagAssignments: bundle.tagAssignments,
    dialerSessionItems: bundle.dialerSessionItems,
    calls: bundle.calls,
    callsPagination: bundle.callsPagination,
    callsTruncated: bundle.callsTruncated,
    opportunities: bundle.opportunities,
    whatsappMessages: bundle.whatsappMessages,
    whatsappOmitted: bundle.whatsappOmitted,
    emailMessages: bundle.emailMessages,
    emailOmitted: bundle.emailOmitted,
    storedEvents: bundle.storedEvents,
    importBatchesNearby: bundle.importBatchesNearby,
  };
}
