import { query } from '../../config/db.js';
import { registerTenant, registerUser } from '../authService.js';
import { cloneDefaultsForTenant } from '../dispositionCloneService.js';
import { validateTenantSlugFormat } from '../../utils/tenantSlugRules.js';

const TENANT_USER_COUNT_SQL = `(SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND (u.is_platform_admin = 0 OR u.is_platform_admin IS NULL))`;

function parseNonNegativeIntParam(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = parseInt(String(value), 10);
  if (Number.isNaN(n) || n < 0) return null;
  return n;
}

/**
 * List tenants for platform admin (paginated).
 * Excludes soft-deleted by default.
 *
 * @param {object} [opts]
 * @param {string} [opts.industryId] - filter by industries.id; use '__none__' for NULL industry_id only
 * @param {string|number} [opts.minUsers] - minimum user count (inclusive)
 * @param {string|number} [opts.maxUsers] - maximum user count (inclusive)
 */
export async function findAll({
  search = '',
  includeDisabled = false,
  page = 1,
  limit = 20,
  industryId,
  minUsers: minUsersRaw,
  maxUsers: maxUsersRaw,
} = {}) {
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
  const offset = (pageNum - 1) * limitNum;
  const limitInt = Math.floor(Number(limitNum)) || 20;
  const offsetInt = Math.floor(Number(offset)) || 0;

  const whereClauses = ['t.is_deleted = 0', 't.id > 1'];
  const params = [];

  if (!includeDisabled) {
    whereClauses.push('t.is_enabled = 1');
  }

  if (search) {
    whereClauses.push('(t.name LIKE ? OR t.slug LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  if (industryId && String(industryId).trim() && String(industryId) !== '__all__') {
    if (String(industryId) === '__none__') {
      whereClauses.push('t.industry_id IS NULL');
    } else {
      whereClauses.push('t.industry_id = ?');
      params.push(industryId);
    }
  }

  const minU = parseNonNegativeIntParam(minUsersRaw);
  const maxU = parseNonNegativeIntParam(maxUsersRaw);
  if (minU !== null && maxU !== null && minU > maxU) {
    const err = new Error('min_users cannot be greater than max_users');
    err.status = 400;
    throw err;
  }
  if (minU !== null) {
    whereClauses.push(`${TENANT_USER_COUNT_SQL} >= ?`);
    params.push(minU);
  }
  if (maxU !== null) {
    whereClauses.push(`${TENANT_USER_COUNT_SQL} <= ?`);
    params.push(maxU);
  }

  const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;

  const [countRow] = await query(
    `SELECT COUNT(*) AS total FROM tenants t ${whereSQL}`,
    params
  );
  const total = countRow.total;

  const data = await query(
    `SELECT t.id, t.name, t.slug, t.industry_id, t.is_enabled, t.created_at, t.updated_at,
            t.whatsapp_send_mode, t.whatsapp_module_enabled, t.whatsapp_automation_enabled,
            t.email_communication_enabled, t.email_module_enabled, t.email_automation_enabled,
            ${TENANT_USER_COUNT_SQL} AS user_count
     FROM tenants t
     ${whereSQL}
     ORDER BY t.name ASC
     LIMIT ${limitInt} OFFSET ${offsetInt}`,
    params
  );

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum) || 1,
    },
  };
}

export async function findById(id) {
  const [row] = await query(
    `SELECT id, name, slug, industry_id, is_enabled, created_at, updated_at,
            whatsapp_send_mode, whatsapp_module_enabled, whatsapp_automation_enabled,
            email_communication_enabled, email_module_enabled, email_automation_enabled
     FROM tenants WHERE id = ? AND is_deleted = 0`,
    [id]
  );
  return row || null;
}

/**
 * Create tenant with first admin user (name, slug, industry_id, is_enabled, admin_email, admin_password, admin_name).
 * Admin is required so every tenant has at least one admin.
 */
export async function create(payload, createdBy) {
  const {
    name,
    slug,
    industry_id,
    is_enabled = 1,
    admin_email,
    admin_password,
    admin_name,
    whatsapp_send_mode,
    whatsapp_module_enabled,
    whatsapp_automation_enabled,
    email_communication_enabled,
    email_module_enabled,
    email_automation_enabled,
  } = payload;

  const tenant = await registerTenant(name, slug, industry_id || null);
  if (is_enabled === 0 && tenant.id) {
    await query('UPDATE tenants SET is_enabled = 0 WHERE id = ?', [tenant.id]);
  }

  const admin = await registerUser(admin_email, admin_password, admin_name, tenant.id, 'admin');

  if (industry_id) {
    try {
      await cloneDefaultsForTenant(tenant.id, industry_id, admin.id);
    } catch (cloneErr) {
      console.error('Failed to auto-clone defaults for tenant:', cloneErr);
    }
  }

  const updatePayload = {
    whatsapp_send_mode,
    whatsapp_module_enabled,
    whatsapp_automation_enabled,
    email_communication_enabled,
    email_module_enabled,
    email_automation_enabled,
  };
  const hasModuleFlags = Object.values(updatePayload).some((v) => v !== undefined);
  if (hasModuleFlags) {
    await update(tenant.id, updatePayload);
  }

  return findById(tenant.id);
}

export async function update(id, payload) {
  const existing = await findById(id);
  if (!existing) return null;

  if (id === 1) {
    const err = new Error('Cannot modify platform tenant');
    err.status = 403;
    throw err;
  }

  const {
    name,
    slug,
    industry_id,
    is_enabled,
    whatsapp_send_mode,
    whatsapp_module_enabled,
    whatsapp_automation_enabled,
    email_communication_enabled,
    email_module_enabled,
    email_automation_enabled,
  } = payload;

  if (slug !== undefined && slug !== existing.slug) {
    const fmt = validateTenantSlugFormat(slug);
    if (!fmt.ok) {
      const err = new Error(fmt.error);
      err.status = 400;
      throw err;
    }
    const [dup] = await query('SELECT id FROM tenants WHERE slug = ? AND is_deleted = 0 AND id != ?', [slug, id]);
    if (dup) {
      const err = new Error('Tenant slug already exists');
      err.status = 409;
      throw err;
    }
  }

  const updates = [];
  const params = [];
  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (slug !== undefined) {
    updates.push('slug = ?');
    params.push(slug);
  }
  if (industry_id !== undefined) {
    updates.push('industry_id = ?');
    params.push(industry_id || null);
  }
  if (is_enabled !== undefined) {
    updates.push('is_enabled = ?');
    params.push(is_enabled ? 1 : 0);
  }
  if (whatsapp_send_mode !== undefined) {
    updates.push('whatsapp_send_mode = ?');
    params.push(['manual', 'automatic'].includes(whatsapp_send_mode) ? whatsapp_send_mode : 'manual');
  }
  if (whatsapp_module_enabled !== undefined) {
    updates.push('whatsapp_module_enabled = ?');
    params.push(whatsapp_module_enabled ? 1 : 0);
  }
  if (whatsapp_automation_enabled !== undefined) {
    updates.push('whatsapp_automation_enabled = ?');
    params.push(whatsapp_automation_enabled ? 1 : 0);
  }
  if (email_communication_enabled !== undefined) {
    updates.push('email_communication_enabled = ?');
    params.push(email_communication_enabled ? 1 : 0);
  }
  if (email_module_enabled !== undefined) {
    updates.push('email_module_enabled = ?');
    params.push(email_module_enabled ? 1 : 0);
  }
  if (email_automation_enabled !== undefined) {
    updates.push('email_automation_enabled = ?');
    params.push(email_automation_enabled ? 1 : 0);
  }

  if (updates.length === 0) return existing;
  params.push(id);
  await query(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`, params);
  return findById(id);
}
