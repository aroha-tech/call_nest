import { query } from '../../config/db.js';

function assertAdminOrManager(user) {
  if (!user || !['admin', 'manager'].includes(user.role)) {
    const err = new Error('Only admin or manager can manage contact tags');
    err.status = 403;
    throw err;
  }
}

export async function listContactTags(tenantId, { includeArchived = false } = {}) {
  const archivedFilter = includeArchived ? '' : 'AND t.deleted_at IS NULL';
  return query(
    `SELECT t.id, t.tenant_id, t.name, t.created_by, t.created_at, t.updated_at,
            t.deleted_at,
            u.name AS created_by_name
     FROM contact_tags t
     LEFT JOIN users u ON u.id = t.created_by AND u.tenant_id = t.tenant_id AND u.is_deleted = 0
     WHERE t.tenant_id = ? ${archivedFilter}
     ORDER BY t.name ASC`,
    [tenantId]
  );
}

export async function createContactTag(tenantId, user, { name } = {}) {
  assertAdminOrManager(user);
  const n = String(name || '').trim();
  if (!n) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (n.length > 100) {
    const err = new Error('name must be at most 100 characters');
    err.status = 400;
    throw err;
  }

  const [dup] = await query(
    `SELECT id FROM contact_tags
     WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL LIMIT 1`,
    [tenantId, n]
  );
  if (dup) {
    const err = new Error('A tag with this name already exists');
    err.status = 400;
    throw err;
  }

  const result = await query(
    `INSERT INTO contact_tags (tenant_id, name, created_by, updated_by)
     VALUES (?, ?, ?, ?)`,
    [tenantId, n, user.id, user.id]
  );

  const [row] = await query(
    `SELECT id, tenant_id, name, created_by, created_at, updated_at FROM contact_tags
     WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [result.insertId, tenantId]
  );
  return row;
}

async function getTagForTenant(tenantId, tagId, { includeArchived = false } = {}) {
  const archivedFilter = includeArchived ? '' : 'AND deleted_at IS NULL';
  const [row] = await query(
    `SELECT * FROM contact_tags WHERE id = ? AND tenant_id = ? ${archivedFilter} LIMIT 1`,
    [tagId, tenantId]
  );
  return row || null;
}

function assertCanModifyTag(user, tagRow) {
  if (user.role === 'admin') return;
  if (user.role === 'manager' && Number(tagRow.created_by) === Number(user.id)) return;
  const err = new Error('You can only edit or archive tags you created');
  err.status = 403;
  throw err;
}

export async function updateContactTag(tenantId, user, tagId, { name } = {}) {
  assertAdminOrManager(user);
  const tag = await getTagForTenant(tenantId, tagId);
  if (!tag) return null;
  assertCanModifyTag(user, tag);

  const n = String(name ?? '').trim();
  if (!n) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }

  const [dup] = await query(
    `SELECT id FROM contact_tags
     WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL AND id != ? LIMIT 1`,
    [tenantId, n, tagId]
  );
  if (dup) {
    const err = new Error('A tag with this name already exists');
    err.status = 400;
    throw err;
  }

  await query(
    `UPDATE contact_tags SET name = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [n, user.id, tagId, tenantId]
  );

  return getTagForTenant(tenantId, tagId);
}

export async function softDeleteContactTag(tenantId, user, tagId) {
  assertAdminOrManager(user);
  const tag = await getTagForTenant(tenantId, tagId);
  if (!tag) return null;
  assertCanModifyTag(user, tag);

  await query(
    `UPDATE contact_tags
     SET deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, updated_by = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [user.id, user.id, tagId, tenantId]
  );

  await query(`DELETE FROM contact_tag_assignments WHERE tenant_id = ? AND tag_id = ?`, [tenantId, tagId]);

  const [row] = await query(`SELECT id, deleted_at FROM contact_tags WHERE id = ? AND tenant_id = ? LIMIT 1`, [
    tagId,
    tenantId,
  ]);
  return row || null;
}

export async function hardDeleteArchivedContactTag(tenantId, user, tagId) {
  assertAdminOrManager(user);
  const tag = await getTagForTenant(tenantId, tagId, { includeArchived: true });
  if (!tag) return null;
  assertCanModifyTag(user, tag);
  if (!tag.deleted_at) {
    const err = new Error('Only archived tags can be permanently deleted');
    err.status = 400;
    throw err;
  }

  await query(`DELETE FROM contact_tag_assignments WHERE tenant_id = ? AND tag_id = ?`, [tenantId, tagId]);
  await query(`DELETE FROM contact_tags WHERE tenant_id = ? AND id = ? LIMIT 1`, [tenantId, tagId]);
  return { id: Number(tagId), deleted: true };
}

export async function unarchiveContactTag(tenantId, user, tagId) {
  assertAdminOrManager(user);
  const tag = await getTagForTenant(tenantId, tagId, { includeArchived: true });
  if (!tag) return null;
  assertCanModifyTag(user, tag);
  if (!tag.deleted_at) return tag;

  const [dup] = await query(
    `SELECT id FROM contact_tags
     WHERE tenant_id = ? AND name = ? AND deleted_at IS NULL AND id != ? LIMIT 1`,
    [tenantId, tag.name, tagId]
  );
  if (dup) {
    const err = new Error('Another active tag already uses this name');
    err.status = 400;
    throw err;
  }

  await query(
    `UPDATE contact_tags
     SET deleted_at = NULL, deleted_by = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NOT NULL`,
    [user.id, tagId, tenantId]
  );

  const [row] = await query(
    `SELECT id, tenant_id, name, created_by, created_at, updated_at, deleted_at
     FROM contact_tags WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [tagId, tenantId]
  );
  return row || null;
}

/**
 * Replace tag links for a contact. Pass null/undefined to skip; [] clears all.
 */
export async function syncContactTagAssignments(tenantId, user, contactId, tagIds) {
  if (tagIds === undefined) return;

  const ids = Array.isArray(tagIds)
    ? [...new Set(tagIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
    : [];

  if (ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query(
      `SELECT id FROM contact_tags
       WHERE tenant_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      [tenantId, ...ids]
    );
    if (rows.length !== ids.length) {
      const err = new Error('Invalid tag_id in list');
      err.status = 400;
      throw err;
    }
  }

  await query(`DELETE FROM contact_tag_assignments WHERE tenant_id = ? AND contact_id = ?`, [tenantId, contactId]);

  for (const tid of ids) {
    await query(
      `INSERT INTO contact_tag_assignments (tenant_id, contact_id, tag_id, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, contactId, tid, user.id, user.id]
    );
  }
}

export async function fetchTagsForContact(tenantId, contactId) {
  return query(
    `SELECT ct.id, ct.name
     FROM contact_tag_assignments cta
     INNER JOIN contact_tags ct ON ct.id = cta.tag_id AND ct.tenant_id = cta.tenant_id
     WHERE cta.tenant_id = ? AND cta.contact_id = ? AND ct.deleted_at IS NULL
     ORDER BY ct.name ASC`,
    [tenantId, contactId]
  );
}

/**
 * Add (contact_id, tag_id) pairs for many contacts. Existing pairs are left unchanged (INSERT IGNORE).
 */
export async function insertTagAssignmentsMerge(tenantId, user, contactIds, tagIds) {
  const cids = Array.isArray(contactIds)
    ? [...new Set(contactIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  const tids = Array.isArray(tagIds)
    ? [...new Set(tagIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
    : [];
  if (cids.length === 0 || tids.length === 0) return;

  const uid = user?.id;
  if (uid == null || !Number.isFinite(Number(uid))) {
    const err = new Error('Invalid user for tag assignment');
    err.status = 400;
    throw err;
  }

  const tuples = [];
  const params = [];
  for (const cid of cids) {
    for (const tid of tids) {
      tuples.push('(?, ?, ?, ?, ?)');
      params.push(tenantId, cid, tid, uid, uid);
    }
  }

  await query(
    `INSERT IGNORE INTO contact_tag_assignments (tenant_id, contact_id, tag_id, created_by, updated_by)
     VALUES ${tuples.join(',')}`,
    params
  );
}
