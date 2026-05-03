/**
 * Shared scope helpers for tenant reports (task performance + reports hub).
 * Keeps admin / manager / agent boundaries consistent across services.
 */

export function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (!Number.isFinite(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(v).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw.replace(' ', 'T'));
  if (!Number.isFinite(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildUserScope(actingUser) {
  const role = String(actingUser?.role || '').toLowerCase();
  if (role === 'admin') return { sql: '', params: [] };
  if (role === 'manager') return { sql: ' AND (u.manager_id = ? OR u.id = ?) ', params: [actingUser.id, actingUser.id] };
  return { sql: ' AND u.id = ? ', params: [actingUser.id] };
}

/** Performance reports: only users with role agent contribute to rollups. */
export const PERF_REPORTS_AGENT_ROLE_SQL = ` AND LOWER(TRIM(COALESCE(u.role, ''))) = 'agent' `;

/**
 * Optional filter: admin narrows to one manager's team. Managers/agents ignore this.
 */
export function buildManagerTeamFilter(actingUser, managerId) {
  const role = String(actingUser?.role || '').toLowerCase();
  if (role !== 'admin' || managerId == null || managerId === '') return { sql: '', params: [] };
  const id = Number(managerId);
  if (!Number.isFinite(id) || id <= 0) return { sql: '', params: [] };
  return { sql: ' AND u.manager_id = ? ', params: [id] };
}
