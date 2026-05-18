import { query } from '../../config/db.js';

export async function listAllPayments({ tenantId, page = 1, limit = 20, search = '' } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * lim;
  const q = String(search || '').trim();
  const tid = tenantId != null && tenantId !== '' ? Number(tenantId) : null;

  const filters = ['tpt.deleted_at IS NULL'];
  const params = [];
  if (Number.isFinite(tid) && tid > 0) {
    filters.push('tpt.tenant_id = ?');
    params.push(tid);
  }
  if (q) {
    filters.push(
      '(tpt.razorpay_payment_id LIKE ? OR tpt.razorpay_order_id LIKE ? OR t.name LIKE ? OR t.slug LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  const where = filters.join(' AND ');

  const countRows = await query(
    `SELECT COUNT(*) AS c
     FROM tenant_payment_transactions tpt
     LEFT JOIN tenants t ON t.id = tpt.tenant_id AND t.is_deleted = 0
     WHERE ${where}`,
    params
  );
  const total = Number(countRows?.[0]?.c || 0);

  const limN = Math.trunc(lim);
  const offN = Math.trunc(offset);
  const rows = await query(
    `SELECT tpt.id, tpt.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
            tpt.razorpay_order_id, tpt.razorpay_payment_id, tpt.amount_paise, tpt.currency,
            tpt.status, tpt.payment_method, tpt.created_at,
            sp.name AS plan_name, sp.code AS plan_code
     FROM tenant_payment_transactions tpt
     LEFT JOIN tenants t ON t.id = tpt.tenant_id AND t.is_deleted = 0
     LEFT JOIN subscription_plans sp ON sp.id = tpt.plan_id
     WHERE ${where}
     ORDER BY tpt.created_at DESC
     LIMIT ${limN} OFFSET ${offN}`,
    params
  );

  return { data: rows, total, page: p, limit: lim };
}

export async function listAllSubscriptions({ tenantId, page = 1, limit = 20, search = '' } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * lim;
  const q = String(search || '').trim();
  const tid = tenantId != null && tenantId !== '' ? Number(tenantId) : null;

  const filters = ['ts.deleted_at IS NULL'];
  const params = [];
  if (Number.isFinite(tid) && tid > 0) {
    filters.push('ts.tenant_id = ?');
    params.push(tid);
  }
  if (q) {
    filters.push(
      '(t.name LIKE ? OR t.slug LIKE ? OR p.code LIKE ? OR p.name LIKE ? OR ts.razorpay_payment_id LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  const where = filters.join(' AND ');

  const countRows = await query(
    `SELECT COUNT(*) AS c
     FROM tenant_telephony_subscriptions ts
     LEFT JOIN tenants t ON t.id = ts.tenant_id AND t.is_deleted = 0
     LEFT JOIN telephony_billing_plans p ON p.id = ts.telephony_billing_plan_id AND p.deleted_at IS NULL
     WHERE ${where}`,
    params
  );
  const telephonyTotal = Number(countRows?.[0]?.c || 0);

  if (telephonyTotal > 0 || !q) {
    const limN = Math.trunc(lim);
    const offN = Math.trunc(offset);
    const rows = await query(
      `SELECT ts.id, ts.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
              ts.status, ts.current_period_start, ts.current_period_end,
              ts.razorpay_order_id, ts.razorpay_payment_id, ts.created_at,
              p.name AS plan_name, p.code AS plan_code, p.billing_interval
       FROM tenant_telephony_subscriptions ts
       LEFT JOIN tenants t ON t.id = ts.tenant_id AND t.is_deleted = 0
       LEFT JOIN telephony_billing_plans p ON p.id = ts.telephony_billing_plan_id AND p.deleted_at IS NULL
       WHERE ${where}
       ORDER BY ts.created_at DESC
       LIMIT ${limN} OFFSET ${offN}`,
      params
    );
    if (telephonyTotal > 0 || rows.length > 0) {
      return { data: rows, total: telephonyTotal, page: p, limit: lim };
    }
  }

  const legacyFilters = ['ts.deleted_at IS NULL'];
  const legacyParams = [];
  if (Number.isFinite(tid) && tid > 0) {
    legacyFilters.push('ts.tenant_id = ?');
    legacyParams.push(tid);
  }
  if (q) {
    legacyFilters.push('(t.name LIKE ? OR t.slug LIKE ? OR sp.code LIKE ? OR sp.name LIKE ?)');
    const like = `%${q}%`;
    legacyParams.push(like, like, like, like);
  }
  const legacyWhere = legacyFilters.join(' AND ');

  const legacyCountRows = await query(
    `SELECT COUNT(*) AS c
     FROM tenant_subscriptions ts
     LEFT JOIN tenants t ON t.id = ts.tenant_id AND t.is_deleted = 0
     LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE ${legacyWhere}`,
    legacyParams
  );
  const total = Number(legacyCountRows?.[0]?.c || 0);

  const limN = Math.trunc(lim);
  const offN = Math.trunc(offset);
  const rows = await query(
    `SELECT ts.id, ts.tenant_id, t.name AS tenant_name, t.slug AS tenant_slug,
            ts.status, ts.current_period_start, ts.current_period_end,
            ts.razorpay_order_id, ts.razorpay_payment_id, ts.created_at,
            sp.name AS plan_name, sp.code AS plan_code, sp.billing_interval
     FROM tenant_subscriptions ts
     LEFT JOIN tenants t ON t.id = ts.tenant_id AND t.is_deleted = 0
     LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE ${legacyWhere}
     ORDER BY ts.created_at DESC
     LIMIT ${limN} OFFSET ${offN}`,
    legacyParams
  );

  return { data: rows, total, page: p, limit: lim };
}

export async function listPlansPlatform() {
  const rows = await query(
    `SELECT id, tenant_id, code, name, description, amount_paise, currency, billing_interval, interval_count, is_active, sort_order
     FROM subscription_plans
     WHERE deleted_at IS NULL
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}
