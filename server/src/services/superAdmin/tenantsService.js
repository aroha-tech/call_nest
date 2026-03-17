import { query } from '../../config/db.js';
import { registerTenant, registerUser } from '../authService.js';
import { cloneDefaultsForTenant } from '../dispositionCloneService.js';

/**
 * List tenants for platform admin (paginated).
 * Excludes soft-deleted by default.
 */
export async function findAll({ search = '', includeDisabled = false, page = 1, limit = 20 } = {}) {
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
            (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND (u.is_platform_admin = 0 OR u.is_platform_admin IS NULL)) AS user_count
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

  if (slug && slug !== existing.slug) {
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
