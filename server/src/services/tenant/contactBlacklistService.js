import { query } from '../../config/db.js';
import { buildOwnershipWhere } from './contactsService.js';
import { safeLogTenantActivity } from './tenantActivityLogService.js';
import { insertContactActivityEvent } from './contactActivityEventsService.js';

function toE164Phone(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const digits = s.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+')) {
    const only = `+${digits.slice(1).replace(/\D/g, '')}`;
    return only.length >= 8 ? only : null;
  }
  const noPlus = digits.replace(/\D/g, '');
  return noPlus.length >= 8 ? `+${noPlus}` : null;
}

async function getVisibleContactById(tenantId, user, contactId) {
  const cid = Number(contactId);
  if (!Number.isFinite(cid) || cid < 1) return null;
  const { whereSQL, params } = buildOwnershipWhere({
    tenantId,
    id: user?.id,
    role: user?.role,
  });
  const finalWhere = `${whereSQL} AND c.id = ?`;
  const rows = await query(
    `SELECT c.id, c.type, c.display_name
     FROM contacts c
     WHERE ${finalWhere}
     LIMIT 1`,
    [...params, cid]
  );
  return rows[0] || null;
}

async function resolveTimelineContactIds(tenantId, contactId, phoneE164) {
  const ids = new Set();
  const cid = Number(contactId);
  if (Number.isFinite(cid) && cid > 0) ids.add(cid);

  const normalizedPhone = toE164Phone(phoneE164);
  if (normalizedPhone) {
    const rows = await query(
      `SELECT DISTINCT cp.contact_id
       FROM contact_phones cp
       INNER JOIN contacts c
         ON c.id = cp.contact_id
        AND c.tenant_id = cp.tenant_id
        AND c.deleted_at IS NULL
       WHERE cp.tenant_id = ?
         AND cp.phone = ?`,
      [tenantId, normalizedPhone]
    );
    for (const r of rows) {
      const rid = Number(r.contact_id);
      if (Number.isFinite(rid) && rid > 0) ids.add(rid);
    }
  }

  return [...ids];
}

export async function listBlacklistEntries(
  tenantId,
  user,
  { search = '', page = 1, limit = 20, block_scope = '' } = {}
) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const where = ['b.tenant_id = ?', 'b.deleted_at IS NULL'];
  const params = [tenantId];
  const scope = String(block_scope || '').trim().toLowerCase();
  if (scope && ['lead', 'contact', 'number'].includes(scope)) {
    where.push('b.block_scope = ?');
    params.push(scope);
  }

  if (user?.role === 'agent') {
    where.push(
      `(b.contact_id IS NULL OR EXISTS (
        SELECT 1 FROM contacts c
        WHERE c.id = b.contact_id
          AND c.tenant_id = b.tenant_id
          AND c.deleted_at IS NULL
          AND c.assigned_user_id = ?
      ))`
    );
    params.push(Number(user.id) || 0);
  } else if (user?.role === 'manager') {
    where.push(
      `(b.contact_id IS NULL OR EXISTS (
        SELECT 1 FROM contacts c
        WHERE c.id = b.contact_id
          AND c.tenant_id = b.tenant_id
          AND c.deleted_at IS NULL
          AND c.manager_id = ?
      ))`
    );
    params.push(Number(user.id) || 0);
  }

  const q = String(search || '').trim();
  if (q) {
    const like = `%${q}%`;
    where.push('(b.phone_e164 LIKE ? OR c.display_name LIKE ? OR c.email LIKE ? OR b.reason LIKE ?)');
    params.push(like, like, like, like);
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const countRows = await query(
    `SELECT COUNT(*) AS total
     FROM contact_blacklist_entries b
     LEFT JOIN contacts c ON c.id = b.contact_id AND c.tenant_id = b.tenant_id
     ${whereSql}`,
    params
  );
  const total = Number(countRows[0]?.total || 0);

  const rows = await query(
    `SELECT
        b.id,
        b.contact_id,
        b.phone_e164,
        b.block_scope,
        b.reason,
        b.created_at,
        b.created_by,
        c.type AS contact_type,
        c.display_name,
        c.email
     FROM contact_blacklist_entries b
     LEFT JOIN contacts c ON c.id = b.contact_id AND c.tenant_id = b.tenant_id
     ${whereSql}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ${Math.floor(limitNum)} OFFSET ${Math.floor(offset)}`,
    params
  );

  return {
    data: rows,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}

export async function createBlacklistEntry(
  tenantId,
  user,
  { contact_id, phone_e164, block_scope, reason = null } = {}
) {
  const scope = String(block_scope || '').trim().toLowerCase();
  if (!['lead', 'contact', 'number'].includes(scope)) {
    const err = new Error('block_scope must be lead, contact, or number');
    err.status = 400;
    throw err;
  }

  let resolvedContactId = null;
  let resolvedPhone = toE164Phone(phone_e164);
  let resolvedScope = scope;

  if (contact_id != null && contact_id !== '') {
    const row = await getVisibleContactById(tenantId, user, contact_id);
    if (!row) {
      const err = new Error('Contact not found');
      err.status = 404;
      throw err;
    }
    resolvedContactId = Number(row.id);
    if (scope !== 'number') {
      resolvedScope = row.type === 'lead' ? 'lead' : 'contact';
    }
  }

  if (resolvedScope === 'number' && !resolvedPhone) {
    const err = new Error('phone_e164 is required for number blacklist');
    err.status = 400;
    throw err;
  }
  if (resolvedScope !== 'number' && !resolvedContactId) {
    const err = new Error('contact_id is required for lead/contact blacklist');
    err.status = 400;
    throw err;
  }

  const dupRows = await query(
    `SELECT id
     FROM contact_blacklist_entries
     WHERE tenant_id = ?
       AND deleted_at IS NULL
       AND contact_id <=> ?
       AND phone_e164 <=> ?
       AND block_scope = ?
     LIMIT 1`,
    [tenantId, resolvedContactId, resolvedPhone, resolvedScope]
  );
  if (dupRows[0]?.id) {
    const err = new Error('Already blacklisted');
    err.status = 409;
    throw err;
  }

  const res = await query(
    `INSERT INTO contact_blacklist_entries
      (tenant_id, contact_id, phone_e164, block_scope, reason, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      resolvedContactId,
      resolvedPhone,
      resolvedScope,
      reason == null ? null : String(reason).slice(0, 255),
      user?.id ?? null,
      user?.id ?? null,
    ]
  );

  const rows = await query(
    `SELECT id, contact_id, phone_e164, block_scope, reason, created_at, created_by
     FROM contact_blacklist_entries
     WHERE tenant_id = ? AND id = ?
     LIMIT 1`,
    [tenantId, res.insertId]
  );
  const created = rows[0] || null;

  if (created) {
    const scopeLabel =
      created.block_scope === 'number'
        ? 'Number blacklisted'
        : created.block_scope === 'lead'
          ? 'Lead blacklisted'
          : 'Contact blacklisted';
    const detail = created.phone_e164 || null;
    const summary = detail ? `${scopeLabel}: ${detail}` : scopeLabel;
    const payload = {
      blacklist_id: Number(created.id),
      block_scope: created.block_scope,
      phone_e164: created.phone_e164 || null,
      reason: created.reason || null,
    };

    const timelineContactIds = await resolveTimelineContactIds(
      tenantId,
      created.contact_id,
      created.phone_e164
    );
    for (const timelineContactId of timelineContactIds) {
      await insertContactActivityEvent(tenantId, {
        contactId: timelineContactId,
        eventType: 'profile_updated',
        actorUserId: user?.id ?? null,
        summary,
        payloadJson: { action: 'blacklist_added', ...payload },
      });
    }

    await safeLogTenantActivity(tenantId, user?.id, {
      event_category: 'contact',
      event_type: 'contact.blacklist.added',
      summary,
      entity_type: 'contact_blacklist',
      entity_id: Number(created.id),
      contact_id: created.contact_id ? Number(created.contact_id) : null,
      payload_json: payload,
    });
  }

  return created;
}

export async function unblockBlacklistEntry(tenantId, user, id) {
  const bid = Number(id);
  if (!Number.isFinite(bid) || bid < 1) {
    const err = new Error('Invalid blacklist id');
    err.status = 400;
    throw err;
  }
  const beforeRows = await query(
    `SELECT id, contact_id, phone_e164, block_scope, reason
     FROM contact_blacklist_entries
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tenantId, bid]
  );
  const existing = beforeRows[0];
  if (!existing) return false;

  const r = await query(
    `UPDATE contact_blacklist_entries
     SET deleted_at = NOW(), deleted_by = ?, updated_by = ?
     WHERE tenant_id = ? AND id = ? AND deleted_at IS NULL`,
    [user?.id ?? null, user?.id ?? null, tenantId, bid]
  );
  if (!Number(r?.affectedRows || 0)) return false;

  const scopeLabel =
    existing.block_scope === 'number'
      ? 'Number unblocked'
      : existing.block_scope === 'lead'
        ? 'Lead unblocked'
        : 'Contact unblocked';
  const detail = existing.phone_e164 || null;
  const summary = detail ? `${scopeLabel}: ${detail}` : scopeLabel;
  const payload = {
    blacklist_id: Number(existing.id),
    block_scope: existing.block_scope,
    phone_e164: existing.phone_e164 || null,
    reason: existing.reason || null,
  };

  const timelineContactIds = await resolveTimelineContactIds(
    tenantId,
    existing.contact_id,
    existing.phone_e164
  );
  for (const timelineContactId of timelineContactIds) {
    await insertContactActivityEvent(tenantId, {
      contactId: timelineContactId,
      eventType: 'profile_updated',
      actorUserId: user?.id ?? null,
      summary,
      payloadJson: { action: 'blacklist_removed', ...payload },
    });
  }

  await safeLogTenantActivity(tenantId, user?.id, {
    event_category: 'contact',
    event_type: 'contact.blacklist.removed',
    summary,
    entity_type: 'contact_blacklist',
    entity_id: Number(existing.id),
    contact_id: existing.contact_id ? Number(existing.contact_id) : null,
    payload_json: payload,
  });

  return true;
}

