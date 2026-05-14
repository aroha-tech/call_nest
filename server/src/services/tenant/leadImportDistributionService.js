import crypto from 'crypto';
import { query } from '../../config/db.js';
import { pickXAiSmartAgentFromLead } from '../../modules/reports/ai/leadImportRoutingEngine.js';

/** @typedef {{ user_id: number; weight: number }} PoolEntry */

function safeJsonParse(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function normalizePoolEntries(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const row of raw) {
    const uid = Number(row?.user_id ?? row?.userId);
    const w = Number(row?.weight ?? row?.percent ?? row?.pct);
    if (!Number.isFinite(uid) || uid <= 0) continue;
    const weight = Number.isFinite(w) && w > 0 ? w : 1;
    out.push({ user_id: uid, weight });
  }
  return out;
}

export function normalizeAssignmentMode(raw) {
  const s = String(raw || 'manual').toLowerCase().trim();
  if (s === 'weighted' || s === 'ai') return s;
  return 'manual';
}

export async function getLeadImportDistributionJson(tenantId) {
  const tid = Number(tenantId);
  if (!tid) return { default_assignment_mode: 'manual', default_pool: [], by_manager: {} };
  const [row] = await query(
    `SELECT lead_import_distribution AS d FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tid]
  );
  const parsed = safeJsonParse(row?.d) || {};
  return {
    default_assignment_mode: normalizeAssignmentMode(parsed.default_assignment_mode),
    default_pool: normalizePoolEntries(parsed.default_pool),
    by_manager:
      parsed.by_manager && typeof parsed.by_manager === 'object' && !Array.isArray(parsed.by_manager)
        ? Object.fromEntries(
            Object.entries(parsed.by_manager).map(([k, v]) => [String(k), normalizePoolEntries(v)])
          )
        : {},
  };
}

async function listAgentsForManager(tenantId, managerId) {
  const mid = Number(managerId);
  if (!mid) return [];
  return query(
    `SELECT id, manager_id, email,
            TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))) AS full_name
     FROM users
     WHERE tenant_id = ? AND role = 'agent' AND is_deleted = 0 AND manager_id = ?
     ORDER BY id ASC`,
    [tenantId, mid]
  );
}

async function listAllTenantAgents(tenantId) {
  return query(
    `SELECT id, manager_id, email,
            TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))) AS full_name
     FROM users
     WHERE tenant_id = ? AND role = 'agent' AND is_deleted = 0
     ORDER BY id ASC`,
    [tenantId]
  );
}

function equalWeightPoolFromAgents(agentRows) {
  const n = agentRows?.length ?? 0;
  if (!n) return [];
  const w = 1;
  return agentRows.map((r) => ({ user_id: Number(r.id), weight: w }));
}

function filterPoolToAgents(pool, allowedIds) {
  const set = new Set(allowedIds.map((x) => Number(x)));
  return pool.filter((p) => set.has(Number(p.user_id)));
}

/**
 * Resolve weighted pool for a CSV import run.
 * @param {object} opts
 * @param {number} opts.tenantId
 * @param {{ id: number; role: string }} opts.user
 * @param {number|undefined|null} opts.defaultManagerId — from import_manager_id normalization
 * @param {unknown} opts.importManagerIdRaw
 * @param {{ default_pool: PoolEntry[]; by_manager: Record<string, PoolEntry[]> }} opts.store
 */
export async function resolveWeightedPoolForImport(tenantId, user, store, defaultManagerId, importManagerIdRaw) {
  const tid = Number(tenantId);
  const mgrFromImport = (() => {
    const raw = importManagerIdRaw;
    if (raw === undefined || raw === null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const effectiveManagerId =
    user.role === 'manager' ? Number(user.id) : defaultManagerId ?? mgrFromImport ?? null;

  if (user.role === 'manager') {
    const myKey = String(user.id);
    const direct = store.by_manager?.[myKey];
    if (direct?.length) {
      const team = await listAgentsForManager(tid, user.id);
      const allowed = team.map((r) => r.id);
      const filtered = filterPoolToAgents(direct, allowed);
      if (filtered.length) return filtered;
    }
    const teamRows = await listAgentsForManager(tid, user.id);
    const fromDefault = filterPoolToAgents(
      store.default_pool || [],
      teamRows.map((x) => x.id)
    );
    if (fromDefault.length) return fromDefault;
    return equalWeightPoolFromAgents(await listAgentsForManager(tid, user.id));
  }

  // admin
  if (effectiveManagerId) {
    const team = await listAgentsForManager(tid, effectiveManagerId);
    const allowed = team.map((r) => r.id);
    const byM = store.by_manager?.[String(effectiveManagerId)];
    if (byM?.length) {
      const filtered = filterPoolToAgents(byM, allowed);
      if (filtered.length) return filtered;
    }
    const fromDef = filterPoolToAgents(store.default_pool || [], allowed);
    if (fromDef.length) return fromDef;
    return equalWeightPoolFromAgents(team);
  }

  // admin, no manager scope
  if (store.default_pool?.length) {
    const all = await listAllTenantAgents(tid);
    const allowed = all.map((r) => r.id);
    const filtered = filterPoolToAgents(store.default_pool, allowed);
    if (filtered.length) return filtered;
  }

  const allAgents = await listAllTenantAgents(tid);
  return equalWeightPoolFromAgents(allAgents);
}

export function pickWeightedRandom(pool) {
  if (!pool?.length) return null;
  const total = pool.reduce((s, p) => s + Number(p.weight) || 0, 0);
  if (!(total > 0)) return Number(pool[0].user_id);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= Number(p.weight) || 0;
    if (r <= 0) return Number(p.user_id);
  }
  return Number(pool[pool.length - 1].user_id);
}

export function pickHashStableFromPool(pool, ctx) {
  if (!pool?.length) return null;
  const h = crypto.createHash('sha256');
  h.update(String(ctx?.email || ''));
  h.update('|');
  h.update(String(ctx?.primaryPhone || ''));
  h.update('|');
  h.update(String(ctx?.finalSource || ''));
  h.update('|');
  h.update(String(ctx?.first_name || ''));
  h.update('|');
  h.update(String(ctx?.last_name || ''));
  const buf = h.digest();
  const n = buf.readUInt32BE(0);
  const total = pool.reduce((s, p) => s + (Number(p.weight) > 0 ? Number(p.weight) : 1), 0);
  let x = total ? n % total : 0;
  for (const p of pool) {
    const w = Number(p.weight) > 0 ? Number(p.weight) : 1;
    if (x < w) return Number(p.user_id);
    x -= w;
  }
  return Number(pool[0].user_id);
}

export async function loadAgentMetaForPool(tenantId, pool) {
  const ids = [...new Set(pool.map((p) => Number(p.user_id)).filter((n) => n > 0))];
  if (!ids.length) return new Map();
  const ph = ids.map(() => '?').join(',');
  const rows = await query(
    `SELECT id, manager_id, email,
            TRIM(CONCAT(COALESCE(first_name,''),' ',COALESCE(last_name,''))) AS full_name
     FROM users
     WHERE tenant_id = ? AND id IN (${ph}) AND role = 'agent' AND is_deleted = 0`,
    [tenantId, ...ids]
  );
  const map = new Map();
  for (const r of rows || []) {
    const id = Number(r.id);
    const label = (r.full_name && String(r.full_name).trim()) || r.email || `Agent ${id}`;
    map.set(id, { id, manager_id: r.manager_id != null ? Number(r.manager_id) : null, email: r.email, label });
  }
  return map;
}

export async function prepareLeadImportAssigner(tenantId, user, { type, defaultManagerId, importManagerIdRaw, distStore: preloadedStore }) {
  if (type !== 'lead' || user?.role === 'agent') return null;
  const store = preloadedStore ?? (await getLeadImportDistributionJson(tenantId));
  const mode = normalizeAssignmentMode(store.default_assignment_mode);
  if (mode !== 'weighted' && mode !== 'ai') return null;

  let pool = await resolveWeightedPoolForImport(tenantId, user, store, defaultManagerId, importManagerIdRaw);
  const meta = await loadAgentMetaForPool(tenantId, pool);
  pool = pool.filter((p) => meta.has(Number(p.user_id)));
  if (!pool.length) {
    const err = new Error(
      'No agents in the assignment pool for this import. Choose a default manager with agents, configure lead import percentages for this workspace, or use manual assignment.'
    );
    err.status = 400;
    throw err;
  }

  return createImportLeadAssigner({
    tenantId,
    mode,
    pool,
    agentMetaPreloaded: meta,
  });
}

export async function createImportLeadAssigner({
  tenantId,
  mode,
  pool,
  agentMetaPreloaded = null,
}) {
  const managerByAgent = new Map();
  const meta = agentMetaPreloaded ?? (await loadAgentMetaForPool(tenantId, pool));
  for (const p of pool) {
    const m = meta.get(Number(p.user_id));
    if (m) managerByAgent.set(Number(p.user_id), m.manager_id);
  }

  return {
    mode,
    pool,
    async assignForRow(ctx) {
      if (mode === 'weighted') {
        const id = pickWeightedRandom(pool);
        return { assigned_user_id: id, manager_id: managerByAgent.get(id) ?? null };
      }
      if (mode === 'ai') {
        const id =
          pickXAiSmartAgentFromLead(ctx, pool, meta) ?? pickHashStableFromPool(pool, ctx);
        return { assigned_user_id: id, manager_id: managerByAgent.get(id) ?? null };
      }
      return { assigned_user_id: null, manager_id: null };
    },
  };
}

function assertAdminOrManager(user) {
  if (user?.role !== 'admin' && user?.role !== 'manager') {
    const err = new Error('Only admins and managers can manage lead import distribution');
    err.status = 403;
    throw err;
  }
}

export async function getLeadImportDistributionForApi(tenantId, user) {
  assertAdminOrManager(user);
  const store = await getLeadImportDistributionJson(tenantId);
  if (user.role === 'manager') {
    return {
      default_assignment_mode: store.default_assignment_mode,
      default_pool: [],
      by_manager: { [String(user.id)]: store.by_manager[String(user.id)] || [] },
    };
  }
  return store;
}

export async function updateLeadImportDistributionForApi(tenantId, user, body) {
  assertAdminOrManager(user);
  const tid = Number(tenantId);
  if (!tid) {
    const err = new Error('Invalid tenant');
    err.status = 400;
    throw err;
  }

  const existing = await getLeadImportDistributionJson(tid);
  let next = { ...existing, by_manager: { ...existing.by_manager } };

  if (user.role === 'manager') {
    const pool = normalizePoolEntries(body?.pool ?? body?.by_manager?.[String(user.id)]);
    const team = await listAgentsForManager(tid, user.id);
    const allowed = new Set(team.map((r) => Number(r.id)));
    for (const e of pool) {
      if (!allowed.has(Number(e.user_id))) {
        const err = new Error('Each user_id must be an agent on your team');
        err.status = 400;
        throw err;
      }
    }
    next.by_manager[String(user.id)] = pool;
  } else {
    if (body?.default_assignment_mode !== undefined) {
      next.default_assignment_mode = normalizeAssignmentMode(body.default_assignment_mode);
    }
    if (body?.default_pool !== undefined) {
      next.default_pool = normalizePoolEntries(body.default_pool);
      // One company-wide list in the UI; drop legacy per-manager rows so imports use default_pool (filtered by team when needed).
      next.by_manager = {};
    }
    if (body?.by_manager !== undefined && typeof body.by_manager === 'object' && body.by_manager !== null) {
      const entries = Object.entries(body.by_manager);
      for (const [mgrKey, arr] of entries) {
        const mid = Number(mgrKey);
        if (!Number.isFinite(mid) || mid <= 0) continue;
        const [mgr] = await query(
          `SELECT id FROM users WHERE id = ? AND tenant_id = ? AND role = 'manager' AND is_deleted = 0 LIMIT 1`,
          [mid, tid]
        );
        if (!mgr) {
          const err = new Error(`Invalid manager id in by_manager: ${mgrKey}`);
          err.status = 400;
          throw err;
        }
        const pool = normalizePoolEntries(arr);
        const team = await listAgentsForManager(tid, mid);
        const allowed = new Set(team.map((r) => Number(r.id)));
        for (const e of pool) {
          if (!allowed.has(Number(e.user_id))) {
            const err = new Error(`Agent ${e.user_id} is not on manager ${mid}'s team`);
            err.status = 400;
            throw err;
          }
        }
        next.by_manager[String(mid)] = pool;
      }
    }
  }

  await query(`UPDATE tenants SET lead_import_distribution = ?, updated_at = NOW() WHERE id = ? AND is_deleted = 0`, [
    JSON.stringify(next),
    tid,
  ]);

  return user.role === 'manager'
    ? {
        default_assignment_mode: next.default_assignment_mode,
        default_pool: [],
        by_manager: { [String(user.id)]: next.by_manager[String(user.id)] || [] },
      }
    : next;
}
