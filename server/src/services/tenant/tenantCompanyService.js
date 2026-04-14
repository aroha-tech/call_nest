import { query } from '../../config/db.js';
import { validateTenantSlugFormat } from '../../utils/tenantSlugRules.js';

async function findTenantRow(tenantId) {
  const [row] = await query(
    `SELECT t.id, t.name, t.slug, t.industry_id, t.created_at, t.updated_at,
            i.name AS industry_name,
            i.code AS industry_code
     FROM tenants t
     LEFT JOIN industries i ON i.id = t.industry_id AND i.is_deleted = 0
     WHERE t.id = ? AND t.is_deleted = 0`,
    [tenantId]
  );
  return row || null;
}

export async function listIndustryOptions() {
  return query(
    `SELECT id, name FROM industries
     WHERE is_deleted = 0 AND is_active = 1
     ORDER BY name ASC`
  );
}

/**
 * Workspace company profile + industry dropdown options (tenant self-service).
 */
export async function getDetailsForTenant(tenantId) {
  const tid = Number(tenantId);
  if (!tid || tid === 1) return null;

  const tenant = await findTenantRow(tid);
  if (!tenant) return null;

  const industry_options = await listIndustryOptions();
  return { tenant, industry_options };
}

/**
 * Update company name, workspace slug, and industry (no platform flags).
 */
export async function updateForTenant(tenantId, payload) {
  const tid = Number(tenantId);
  if (!tid || tid === 1) {
    const err = new Error('Cannot update this workspace');
    err.status = 403;
    throw err;
  }

  const existing = await findTenantRow(tid);
  if (!existing) return null;

  const { name, slug, industry_id } = payload;

  if (name !== undefined) {
    const n = name === null ? '' : String(name).trim();
    if (!n) {
      const err = new Error('Company name is required');
      err.status = 400;
      throw err;
    }
    if (n.length > 255) {
      const err = new Error('Company name is too long');
      err.status = 400;
      throw err;
    }
  }

  if (slug !== undefined && slug !== existing.slug) {
    const fmt = validateTenantSlugFormat(slug);
    if (!fmt.ok) {
      const err = new Error(fmt.error);
      err.status = 400;
      throw err;
    }
    const [dup] = await query(
      'SELECT id FROM tenants WHERE slug = ? AND is_deleted = 0 AND id != ?',
      [String(slug).trim(), tid]
    );
    if (dup) {
      const err = new Error('This workspace address is already taken');
      err.status = 409;
      throw err;
    }
  }

  if (industry_id !== undefined) {
    if (industry_id === null || industry_id === '') {
      // allowed — clear industry
    } else {
      const [ind] = await query(
        'SELECT id FROM industries WHERE id = ? AND is_deleted = 0 AND is_active = 1',
        [industry_id]
      );
      if (!ind) {
        const err = new Error('Invalid industry');
        err.status = 400;
        throw err;
      }
    }
  }

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(String(name).trim());
  }
  if (slug !== undefined) {
    updates.push('slug = ?');
    params.push(String(slug).trim());
  }
  if (industry_id !== undefined) {
    updates.push('industry_id = ?');
    params.push(industry_id === null || industry_id === '' ? null : industry_id);
  }

  if (updates.length === 0) {
    return findTenantRow(tid);
  }

  params.push(tid);
  await query(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`, params);

  return findTenantRow(tid);
}
