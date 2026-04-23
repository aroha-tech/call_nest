import { query } from '../../config/db.js';

/** Master action code: agent must choose pipeline + stage on the dialer. */
export const APPLY_DEAL_ACTION_CODE = 'apply_deal';

export function parseDispositionActionsJson(actions) {
  if (!actions) return [];
  if (typeof actions === 'string') {
    try {
      const v = JSON.parse(actions);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(actions) ? actions : [];
}

/**
 * Load disposition fields needed when logging a call outcome (next_action, legacy deal columns, apply_deal flag).
 */
export async function loadDispositionCallApplyMeta(tenantId, dispositionId) {
  const [row] = await query(
    `SELECT next_action, deal_id, stage_id, actions
     FROM dispositions
     WHERE tenant_id = ? AND id = ? AND is_deleted = 0
     LIMIT 1`,
    [tenantId, dispositionId]
  );
  if (!row) return null;

  const arr = parseDispositionActionsJson(row.actions);
  const actionIds = arr.map((a) => a?.action_id).filter(Boolean);
  let requires_deal_selection = false;
  if (actionIds.length > 0) {
    const ph = actionIds.map(() => '?').join(',');
    const codes = await query(
      `SELECT id, code FROM dispo_actions_master WHERE id IN (${ph}) AND is_deleted = 0`,
      actionIds
    );
    requires_deal_selection = codes.some((c) => c.code === APPLY_DEAL_ACTION_CODE);
  }

  const legacy_deal_id = row.deal_id != null ? Number(row.deal_id) : null;
  const legacy_stage_id = row.stage_id != null ? Number(row.stage_id) : null;

  return {
    next_action: row.next_action,
    requires_deal_selection,
    legacy_deal_id:
      legacy_deal_id != null && Number.isFinite(legacy_deal_id) ? legacy_deal_id : null,
    legacy_stage_id:
      legacy_stage_id != null && Number.isFinite(legacy_stage_id) ? legacy_stage_id : null,
  };
}

/**
 * Dialer session: strip raw actions JSON and add requires_deal_selection per disposition (batched).
 */
export async function enrichDispositionsForDialerSession(tenantId, dispositions) {
  if (!dispositions?.length) return [];

  const parsed = dispositions.map((d) => ({
    raw: d,
    arr: parseDispositionActionsJson(d.actions),
  }));

  const allIds = new Set();
  for (const p of parsed) {
    for (const a of p.arr) {
      if (a?.action_id) allIds.add(String(a.action_id));
    }
  }

  let codeById = new Map();
  if (allIds.size > 0) {
    const idList = [...allIds];
    const ph = idList.map(() => '?').join(',');
    const rows = await query(
      `SELECT id, code FROM dispo_actions_master WHERE id IN (${ph}) AND is_deleted = 0`,
      idList
    );
    codeById = new Map(rows.map((r) => [String(r.id), r.code]));
  }

  return parsed.map(({ raw, arr }) => {
    const { actions: _drop, ...rest } = raw;
    const action_codes = arr
      .map((a) => (a?.action_id ? codeById.get(String(a.action_id)) : null))
      .filter(Boolean);
    const requires_deal_selection = arr.some(
      (a) => a?.action_id && codeById.get(String(a.action_id)) === APPLY_DEAL_ACTION_CODE
    );
    return { ...rest, requires_deal_selection, action_codes };
  });
}
