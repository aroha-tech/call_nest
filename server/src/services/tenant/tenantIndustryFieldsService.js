import { query } from '../../config/db.js';

/**
 * @returns {Promise<string|null>} industry master id (UUID) or null
 */
export async function getTenantIndustryId(tenantId) {
  const [row] = await query(`SELECT industry_id FROM tenants WHERE id = ?`, [tenantId]);
  if (!row?.industry_id) return null;
  return String(row.industry_id);
}

/**
 * Full catalog for industry (active only). Super-admin list reuse.
 */
export async function listDefinitionsForIndustry(industryId) {
  return query(
    `SELECT id, industry_id, field_key, label, type, options_json, sort_order,
            is_required, is_optional, is_active
     FROM industry_field_definitions
     WHERE industry_id = ? AND is_active = 1
     ORDER BY sort_order ASC, label ASC`,
    [industryId]
  );
}

/**
 * Effective field definitions for tenant: non-optional always; optional only if enabled in settings.
 * @returns {Promise<Array<object>>}
 */
export async function getEffectiveFieldDefinitions(tenantId) {
  const industryId = await getTenantIndustryId(tenantId);
  if (!industryId) return [];

  const defs = await query(
    `SELECT d.id, d.field_key, d.label, d.type, d.options_json, d.sort_order, d.is_required, d.is_optional
     FROM industry_field_definitions d
     WHERE d.industry_id = ? AND d.is_active = 1
     ORDER BY d.sort_order ASC, d.label ASC`,
    [industryId]
  );

  if (defs.length === 0) return [];

  const optionalIds = defs.filter((d) => d.is_optional === 1).map((d) => d.id);
  let enabledSet = new Set();
  if (optionalIds.length > 0) {
    const ph = optionalIds.map(() => '?').join(',');
    const settings = await query(
      `SELECT field_definition_id, is_enabled
       FROM tenant_industry_field_settings
       WHERE tenant_id = ? AND field_definition_id IN (${ph})`,
      [tenantId, ...optionalIds]
    );
    for (const s of settings) {
      if (s.is_enabled === 1) enabledSet.add(String(s.field_definition_id));
    }
  }

  return defs.filter((d) => {
    if (d.is_optional !== 1) return true;
    return enabledSet.has(String(d.id));
  });
}

/**
 * Optional-pack fields for tenant industry + current enabled flags (for settings UI).
 */
export async function getOptionalFieldsWithSettings(tenantId) {
  const industryId = await getTenantIndustryId(tenantId);
  if (!industryId) return { industry_id: null, fields: [] };

  const defs = await query(
    `SELECT d.id, d.field_key, d.label, d.type, d.sort_order, d.is_required
     FROM industry_field_definitions d
     WHERE d.industry_id = ? AND d.is_active = 1 AND d.is_optional = 1
     ORDER BY d.sort_order ASC, d.label ASC`,
    [industryId]
  );

  if (defs.length === 0) return { industry_id: industryId, fields: [] };

  const ids = defs.map((d) => d.id);
  const ph = ids.map(() => '?').join(',');
  const settings = await query(
    `SELECT field_definition_id, is_enabled
     FROM tenant_industry_field_settings
     WHERE tenant_id = ? AND field_definition_id IN (${ph})`,
    [tenantId, ...ids]
  );
  const map = new Map(settings.map((s) => [String(s.field_definition_id), s.is_enabled === 1]));

  const fields = defs.map((d) => ({
    ...d,
    /** If no row yet, default off for optional fields */
    is_enabled: map.has(String(d.id)) ? map.get(String(d.id)) : false,
  }));

  return { industry_id: industryId, fields };
}

/**
 * Replace enabled flags for optional fields (only ids belonging to tenant's industry).
 */
export async function updateOptionalFieldSettings(tenantId, enabledFieldIds = []) {
  const industryId = await getTenantIndustryId(tenantId);
  if (!industryId) {
    const err = new Error('Tenant has no industry set');
    err.status = 400;
    throw err;
  }

  const ids = [...new Set((enabledFieldIds || []).map((x) => String(x).trim()).filter(Boolean))];
  if (ids.length === 0) {
    await query(
      `DELETE tifs FROM tenant_industry_field_settings tifs
       INNER JOIN industry_field_definitions d ON d.id = tifs.field_definition_id
       WHERE tifs.tenant_id = ? AND d.industry_id = ? AND d.is_optional = 1`,
      [tenantId, industryId]
    );
    return getOptionalFieldsWithSettings(tenantId);
  }

  const ph = ids.map(() => '?').join(',');
  const valid = await query(
    `SELECT id FROM industry_field_definitions
     WHERE industry_id = ? AND is_optional = 1 AND is_active = 1 AND id IN (${ph})`,
    [industryId, ...ids]
  );
  const validSet = new Set(valid.map((r) => String(r.id)));

  await query(
    `DELETE tifs FROM tenant_industry_field_settings tifs
     INNER JOIN industry_field_definitions d ON d.id = tifs.field_definition_id
     WHERE tifs.tenant_id = ? AND d.industry_id = ? AND d.is_optional = 1`,
    [tenantId, industryId]
  );

  for (const id of validSet) {
    await query(
      `INSERT INTO tenant_industry_field_settings (tenant_id, field_definition_id, is_enabled)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_enabled = 1`,
      [tenantId, id]
    );
  }

  return getOptionalFieldsWithSettings(tenantId);
}

function parseOptions(def) {
  const o = def.options_json;
  if (o == null) return [];
  if (Array.isArray(o)) return o.map((x) => String(x));
  if (typeof o === 'string') {
    try {
      const p = JSON.parse(o);
      return Array.isArray(p) ? p.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Validate keys and coerce values for contacts.industry_profile.
 * @returns {{ jsonStr: string|null, error?: string }}
 */
export async function validateIndustryProfileForTenant(tenantId, raw) {
  const defs = await getEffectiveFieldDefinitions(tenantId);

  const isEmptyPayload =
    raw == null ||
    raw === '' ||
    (typeof raw === 'object' &&
      raw !== null &&
      !Array.isArray(raw) &&
      Object.keys(raw).length === 0);

  if (defs.length === 0) {
    if (isEmptyPayload) return { jsonStr: null };
    return { error: 'Industry fields are not available for this workspace' };
  }

  let obj = raw;
  if (isEmptyPayload) return { jsonStr: null };
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj);
    } catch {
      return { error: 'industry_profile must be a JSON object' };
    }
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { error: 'industry_profile must be an object' };
  }

  const out = {};
  for (const d of defs) {
    const key = d.field_key;
    const has = Object.prototype.hasOwnProperty.call(obj, key);
    let v = has ? obj[key] : undefined;

    if (v === null || v === undefined || v === '') {
      if (d.is_required === 1) {
        return { error: `Missing required industry field: ${d.label}` };
      }
      continue;
    }

    const t = d.type;
    if (t === 'boolean') {
      const s = String(v).toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(s)) out[key] = true;
      else if (['0', 'false', 'no', 'off'].includes(s)) out[key] = false;
      else return { error: `Invalid boolean for ${d.label}` };
    } else if (t === 'number') {
      const n = Number(String(v).replace(/,/g, ''));
      if (!Number.isFinite(n)) return { error: `Invalid number for ${d.label}` };
      out[key] = n;
    } else if (t === 'date') {
      const s = String(v).trim();
      const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
      out[key] = iso ? iso[1] : s;
    } else if (t === 'select') {
      const opts = parseOptions(d);
      const sv = String(v).trim();
      if (opts.length > 0 && !opts.includes(sv)) return { error: `Invalid option for ${d.label}` };
      out[key] = sv;
    } else if (t === 'multiselect' || t === 'multiselect_dropdown') {
      let arr;
      if (Array.isArray(v)) arr = v.map((x) => String(x).trim()).filter(Boolean);
      else if (typeof v === 'string') {
        try {
          const p = JSON.parse(v);
          arr = Array.isArray(p)
            ? p.map((x) => String(x).trim()).filter(Boolean)
            : v
                .split(/[,;|]/)
                .map((x) => x.trim())
                .filter(Boolean);
        } catch {
          arr = v
            .split(/[,;|]/)
            .map((x) => x.trim())
            .filter(Boolean);
        }
      } else return { error: `Invalid value for ${d.label}` };
      const opts = parseOptions(d);
      if (opts.length > 0) {
        for (const x of arr) {
          if (!opts.includes(x)) return { error: `Invalid option for ${d.label}` };
        }
      }
      out[key] = arr;
    } else {
      out[key] = String(v).trim();
    }
  }

  return { jsonStr: Object.keys(out).length === 0 ? null : JSON.stringify(out) };
}

export function parseIndustryProfileColumn(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
