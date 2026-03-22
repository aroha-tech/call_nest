/**
 * Dynamic filter campaigns: rules JSON → SQL fragments for contacts (alias c) and primary phone (p).
 * Supported payload: { version: 2, rules: [...] } or legacy { source?, status_id?, type? }.
 */

const PROPERTY_META = {
  type: { column: 'c.type', kind: 'enum', enumValues: ['lead', 'contact'] },
  source: { column: 'c.source', kind: 'text' },
  /** Master tag id (contact_tag_assignments); not a column on c. */
  tag_id: { kind: 'tag' },
  status_id: { column: 'c.status_id', kind: 'text' },
  email: { column: 'c.email', kind: 'text' },
  first_name: { column: 'c.first_name', kind: 'text' },
  last_name: { column: 'c.last_name', kind: 'text' },
  display_name: { column: 'c.display_name', kind: 'text' },
  manager_id: { column: 'c.manager_id', kind: 'id' },
  assigned_user_id: { column: 'c.assigned_user_id', kind: 'id' },
  campaign_id: { column: 'c.campaign_id', kind: 'id' },
  primary_phone: { column: 'p.phone', kind: 'text' },
  created_at: { column: 'c.created_at', kind: 'datetime' },
};

const OPS_BY_KIND = {
  text: ['eq', 'ne', 'contains', 'not_contains', 'is_blank', 'is_not_blank', 'in'],
  id: ['eq', 'ne', 'in', 'is_blank', 'is_not_blank'],
  tag: ['eq', 'ne', 'in', 'is_blank', 'is_not_blank'],
  enum: ['eq', 'ne', 'in'],
  datetime: ['eq', 'ne', 'lt', 'gt', 'lte', 'gte', 'is_blank', 'is_not_blank'],
};

function parseFiltersInput(filtersJson) {
  if (filtersJson == null || filtersJson === '') return {};
  if (typeof filtersJson === 'object') return filtersJson;
  try {
    return JSON.parse(filtersJson);
  } catch {
    return {};
  }
}

/**
 * @returns {Array<{ property: string, op: string, value?: unknown }>}
 */
export function normalizeFiltersToRules(filtersJson) {
  const parsed = parseFiltersInput(filtersJson);
  if (!parsed || typeof parsed !== 'object') return [];

  if (Array.isArray(parsed.rules)) {
    return parsed.rules
      .filter((r) => r && typeof r.property === 'string' && typeof r.op === 'string')
      .filter((r) => r.property.trim() !== 'tag')
      .map((r) => ({ property: r.property.trim(), op: String(r.op).trim(), value: r.value }));
  }

  const legacy = [];
  if (parsed.source) legacy.push({ property: 'source', op: 'eq', value: parsed.source });
  if (parsed.status_id) legacy.push({ property: 'status_id', op: 'eq', value: parsed.status_id });
  if (parsed.type) legacy.push({ property: 'type', op: 'eq', value: parsed.type });
  return legacy;
}

function assertOpForKind(kind, op) {
  const allowed = OPS_BY_KIND[kind];
  if (!allowed || !allowed.includes(op)) {
    const err = new Error(`Operator "${op}" is not allowed for this field`);
    err.status = 400;
    throw err;
  }
}

function normalizeId(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pushRule(whereClauses, params, rule) {
  const { property, op, value } = rule;
  const meta = PROPERTY_META[property];
  if (!meta) {
    const err = new Error(`Unknown filter property: ${property}`);
    err.status = 400;
    throw err;
  }

  assertOpForKind(meta.kind, op);

  if (meta.kind === 'tag') {
    const existsAny =
      'EXISTS (SELECT 1 FROM contact_tag_assignments cta_t WHERE cta_t.contact_id = c.id AND cta_t.tenant_id = c.tenant_id)';
    const notExistsAny =
      'NOT EXISTS (SELECT 1 FROM contact_tag_assignments cta_t WHERE cta_t.contact_id = c.id AND cta_t.tenant_id = c.tenant_id)';

    if (op === 'is_blank') {
      whereClauses.push(notExistsAny);
      return;
    }
    if (op === 'is_not_blank') {
      whereClauses.push(existsAny);
      return;
    }
    if (op === 'eq') {
      const idVal = normalizeId(value);
      if (idVal == null) {
        whereClauses.push(notExistsAny);
      } else {
        whereClauses.push(
          'EXISTS (SELECT 1 FROM contact_tag_assignments cta_t WHERE cta_t.contact_id = c.id AND cta_t.tenant_id = c.tenant_id AND cta_t.tag_id = ?)'
        );
        params.push(idVal);
      }
      return;
    }
    if (op === 'ne') {
      const idVal = normalizeId(value);
      if (idVal == null) {
        whereClauses.push(existsAny);
      } else {
        whereClauses.push(
          'NOT EXISTS (SELECT 1 FROM contact_tag_assignments cta_t WHERE cta_t.contact_id = c.id AND cta_t.tenant_id = c.tenant_id AND cta_t.tag_id = ?)'
        );
        params.push(idVal);
      }
      return;
    }
    if (op === 'in') {
      const arr = Array.isArray(value) ? value : value != null && value !== '' ? [value] : [];
      const nums = arr.map(normalizeId).filter((n) => n != null);
      if (nums.length === 0) {
        whereClauses.push('1=0');
        return;
      }
      const ph = nums.map(() => '?').join(',');
      whereClauses.push(
        `EXISTS (SELECT 1 FROM contact_tag_assignments cta_t WHERE cta_t.contact_id = c.id AND cta_t.tenant_id = c.tenant_id AND cta_t.tag_id IN (${ph}))`
      );
      params.push(...nums);
      return;
    }
    const err = new Error('Unsupported tag filter');
    err.status = 400;
    throw err;
  }

  const col = meta.column;

  const noValueOps = ['is_blank', 'is_not_blank'];
  if (noValueOps.includes(op)) {
    if (op === 'is_blank') {
      whereClauses.push(`(${col} IS NULL OR ${col} = '')`);
    } else {
      whereClauses.push(`(${col} IS NOT NULL AND ${col} != '')`);
    }
    return;
  }

  if (op === 'in') {
    const arr = Array.isArray(value) ? value : value != null && value !== '' ? [value] : [];
    if (arr.length === 0) {
      whereClauses.push('1=0');
      return;
    }
    if (meta.kind === 'id') {
      const nums = arr.map(normalizeId).filter((n) => n != null);
      if (nums.length === 0) {
        whereClauses.push('1=0');
        return;
      }
      const ph = nums.map(() => '?').join(',');
      whereClauses.push(`${col} IN (${ph})`);
      params.push(...nums);
      return;
    }
    if (meta.kind === 'enum' && meta.enumValues) {
      const allowed = new Set(meta.enumValues);
      const ok = arr.filter((v) => allowed.has(String(v)));
      if (ok.length === 0) {
        whereClauses.push('1=0');
        return;
      }
      const ph = ok.map(() => '?').join(',');
      whereClauses.push(`${col} IN (${ph})`);
      params.push(...ok);
      return;
    }
    const ph = arr.map(() => '?').join(',');
    whereClauses.push(`${col} IN (${ph})`);
    params.push(...arr.map((v) => (v == null ? null : String(v))));
    return;
  }

  if (meta.kind === 'id') {
    const idVal = normalizeId(value);
    if (op === 'eq') {
      if (idVal == null) {
        whereClauses.push(`${col} IS NULL`);
      } else {
        whereClauses.push(`${col} = ?`);
        params.push(idVal);
      }
      return;
    }
    if (op === 'ne') {
      if (idVal == null) {
        whereClauses.push(`${col} IS NOT NULL`);
      } else {
        whereClauses.push(`(${col} IS NULL OR ${col} != ?)`);
        params.push(idVal);
      }
      return;
    }
  }

  if (meta.kind === 'enum' && meta.enumValues) {
    const v = String(value ?? '');
    if (!meta.enumValues.includes(v)) {
      const err = new Error(`Invalid value for ${property}`);
      err.status = 400;
      throw err;
    }
    if (op === 'eq') {
      whereClauses.push(`${col} = ?`);
      params.push(v);
      return;
    }
    if (op === 'ne') {
      whereClauses.push(`(${col} IS NULL OR ${col} != ?)`);
      params.push(v);
      return;
    }
    const errEnum = new Error(`Unsupported operator for record type`);
    errEnum.status = 400;
    throw errEnum;
  }

  if (meta.kind === 'datetime') {
    const v = value == null ? '' : String(value).trim();
    if (!v) {
      const err = new Error(`Value required for ${property} with operator ${op}`);
      err.status = 400;
      throw err;
    }
    const cmp = { lt: '<', gt: '>', lte: '<=', gte: '>=', eq: '=', ne: '!=' }[op];
    if (!cmp) {
      const err = new Error(`Invalid operator for datetime`);
      err.status = 400;
      throw err;
    }
    if (op === 'ne') {
      whereClauses.push(`(${col} IS NULL OR ${col} ${cmp} ?)`);
    } else {
      whereClauses.push(`${col} ${cmp} ?`);
    }
    params.push(v);
    return;
  }

  // text
  const v = value == null ? '' : String(value);
  if (op === 'eq') {
    whereClauses.push(`${col} <=> ?`);
    params.push(v || null);
    return;
  }
  if (op === 'ne') {
    whereClauses.push(`NOT (${col} <=> ?)`);
    params.push(v || null);
    return;
  }
  if (op === 'contains') {
    whereClauses.push(`${col} LIKE ?`);
    params.push(`%${v}%`);
    return;
  }
  if (op === 'not_contains') {
    whereClauses.push(`(${col} NOT LIKE ? OR ${col} IS NULL)`);
    params.push(`%${v}%`);
    return;
  }

  const err = new Error(`Unsupported filter combination`);
  err.status = 400;
  throw err;
}

/**
 * Appends AND clauses for all rules. Mutates whereClauses and params.
 */
export function appendCampaignFilterRules(whereClauses, params, filtersJson) {
  const rules = normalizeFiltersToRules(filtersJson);
  for (const rule of rules) {
    pushRule(whereClauses, params, rule);
  }
  return rules.length;
}

export { PROPERTY_META };
