import { query } from '../../config/db.js';

function parseDbDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Active subscription row for tenant (status active, period not ended). */
export async function getActiveTelephonySubscription(tenantId) {
  const tid = Number(tenantId);
  const [row] = await query(
    `SELECT ts.id, ts.tenant_id, ts.telephony_billing_plan_id, ts.status,
            ts.current_period_start, ts.current_period_end, ts.auto_renew,
            ts.razorpay_order_id, ts.razorpay_payment_id, ts.razorpay_subscription_id,
            p.code AS plan_code, p.name AS plan_name, p.plan_type, p.subscription_tier
     FROM tenant_telephony_subscriptions ts
     JOIN telephony_billing_plans p
       ON p.id = ts.telephony_billing_plan_id AND p.deleted_at IS NULL
     WHERE ts.tenant_id = ? AND ts.status = 'active' AND ts.deleted_at IS NULL
     ORDER BY ts.current_period_end DESC
     LIMIT 1`,
    [tid]
  );
  if (!row) return null;
  const end = parseDbDate(row.current_period_end);
  if (!end || end.getTime() < Date.now()) {
    return { ...row, status: 'expired', _expired: true };
  }
  return row;
}

/**
 * Blocks outbound calls when there is no active telephony subscription period.
 * Wallet credits may remain; subscription gates calling.
 */
export async function assertActiveTelephonySubscription(tenantId) {
  const sub = await getActiveTelephonySubscription(tenantId);
  if (!sub || sub._expired || String(sub.status) !== 'active') {
    const err = new Error(
      'Your workspace subscription has expired. Renew your plan in Plans & billing to place calls.'
    );
    err.status = 402;
    err.code = 'SUBSCRIPTION_EXPIRED';
    err.details = {
      subscription_status: sub?._expired ? 'expired' : sub?.status || 'none',
      current_period_end: sub?.current_period_end ?? null,
    };
    throw err;
  }
  return sub;
}
