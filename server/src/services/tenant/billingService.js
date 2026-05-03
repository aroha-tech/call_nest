import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { query, withConnection } from '../../config/db.js';
import {
  computePeriodEnd,
  verifyRazorpayPaymentSignature,
  shortReceiptId,
} from '../billing/billingCore.js';

function assertBillingConfigured() {
  if (!env.razorpay?.keyId || !env.razorpay?.keySecret) {
    const err = new Error('Razorpay is not configured on the server (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)');
    err.status = 503;
    throw err;
  }
}

function getRazorpay() {
  assertBillingConfigured();
  return new Razorpay({
    key_id: env.razorpay.keyId,
    key_secret: env.razorpay.keySecret,
  });
}

export async function listPlansForTenant(tenantId) {
  const tid = Number(tenantId);
  const rows = await query(
    `SELECT id, tenant_id, code, name, description, amount_paise, currency, billing_interval, interval_count, sort_order
     FROM subscription_plans
     WHERE deleted_at IS NULL AND is_active = 1
       AND (tenant_id IS NULL OR tenant_id = ?)
     ORDER BY sort_order ASC, id ASC`,
    [tid]
  );
  return rows;
}

export function getClientBillingConfig() {
  return {
    razorpayKeyId: env.razorpay?.keyId || '',
    razorpayConfigured: Boolean(env.razorpay?.keyId && env.razorpay?.keySecret),
  };
}

export async function createCheckoutOrder(tenantId, userId, planId) {
  const tid = Number(tenantId);
  const pid = Number(planId);
  const uid = userId != null ? Number(userId) : null;
  if (!Number.isFinite(tid) || tid < 1) {
    const err = new Error('Invalid tenant');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(pid) || pid < 1) {
    const err = new Error('Invalid plan');
    err.status = 400;
    throw err;
  }

  const [plan] = await query(
    `SELECT id, tenant_id, amount_paise, currency, billing_interval, interval_count, name, code
     FROM subscription_plans
     WHERE id = ? AND deleted_at IS NULL AND is_active = 1
       AND (tenant_id IS NULL OR tenant_id = ?)
     LIMIT 1`,
    [pid, tid]
  );
  if (!plan) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }

  assertBillingConfigured();
  const rzp = getRazorpay();
  const amount = Number(plan.amount_paise);
  const receipt = shortReceiptId(tid, pid);

  const order = await rzp.orders.create({
    amount,
    currency: plan.currency || 'INR',
    receipt,
    notes: {
      tenant_id: String(tid),
      plan_id: String(pid),
    },
  });

  await query(
    `INSERT INTO tenant_billing_orders (
       tenant_id, plan_id, razorpay_order_id, amount_paise, currency, status, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [tid, pid, order.id, amount, order.currency || plan.currency || 'INR', uid, uid]
  );

  return {
    orderId: order.id,
    amount,
    currency: order.currency || plan.currency || 'INR',
    keyId: env.razorpay.keyId,
    plan: {
      id: plan.id,
      name: plan.name,
      code: plan.code,
      billing_interval: plan.billing_interval,
    },
  };
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function finalizePaidOrder(conn, {
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  amountPaise,
  currency,
  userId,
  paymentMethod,
  rawPayload,
}) {
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;

  const [rows] = await conn.execute(
    `SELECT tbo.id, tbo.tenant_id, tbo.plan_id, tbo.amount_paise, tbo.currency, tbo.status,
            sp.billing_interval, sp.interval_count
     FROM tenant_billing_orders tbo
     JOIN subscription_plans sp ON sp.id = tbo.plan_id AND sp.deleted_at IS NULL
     WHERE tbo.razorpay_order_id = ? AND tbo.tenant_id = ? AND tbo.deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [razorpayOrderId, tid]
  );
  const billingRow = rows?.[0];
  if (!billingRow) {
    const err = new Error('Checkout order not found');
    err.status = 404;
    throw err;
  }
  if (String(billingRow.status) === 'completed') {
    return { duplicate: true };
  }

  const expectedAmount = Number(billingRow.amount_paise);
  if (Number(amountPaise) !== expectedAmount) {
    const err = new Error('Payment amount does not match order');
    err.status = 400;
    throw err;
  }

  const now = new Date();
  const periodEnd = computePeriodEnd(now, billingRow.billing_interval, Number(billingRow.interval_count) || 1);

  await conn.execute(
    `UPDATE tenant_subscriptions
     SET status = 'expired', updated_by = ?, updated_at = UTC_TIMESTAMP()
     WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [uid, tid]
  );

  const [subRes] = await conn.execute(
    `INSERT INTO tenant_subscriptions (
       tenant_id, plan_id, status, current_period_start, current_period_end,
       razorpay_order_id, razorpay_payment_id, created_by, updated_by
     ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    [
      tid,
      billingRow.plan_id,
      now.toISOString().slice(0, 19).replace('T', ' '),
      periodEnd.toISOString().slice(0, 19).replace('T', ' '),
      razorpayOrderId,
      razorpayPaymentId,
      uid,
      uid,
    ]
  );
  const subscriptionId = subRes.insertId;

  try {
    await conn.execute(
      `INSERT INTO tenant_payment_transactions (
         tenant_id, subscription_id, plan_id, razorpay_order_id, razorpay_payment_id,
         amount_paise, currency, status, payment_method, raw_payload_json, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'captured', ?, ?, ?, ?)`,
      [
        tid,
        subscriptionId,
        billingRow.plan_id,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise,
        currency || billingRow.currency || 'INR',
        paymentMethod || null,
        rawPayload ? JSON.stringify(rawPayload) : null,
        uid,
        uid,
      ]
    );
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') {
      await conn.execute(
        `UPDATE tenant_billing_orders SET status = 'completed', updated_by = ?, updated_at = UTC_TIMESTAMP()
         WHERE id = ? AND deleted_at IS NULL`,
        [uid, billingRow.id]
      );
      return { duplicate: true };
    }
    throw e;
  }

  await conn.execute(
    `UPDATE tenant_billing_orders
     SET status = 'completed', updated_by = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND deleted_at IS NULL`,
    [uid, billingRow.id]
  );

  return { subscriptionId, duplicate: false };
}

export async function verifyPaymentAndActivate(tenantId, userId, body) {
  assertBillingConfigured();
  const tid = Number(tenantId);
  const orderId = body?.razorpay_order_id || body?.order_id;
  const paymentId = body?.razorpay_payment_id || body?.payment_id;
  const signature = body?.razorpay_signature || body?.signature;
  const uid = userId != null ? Number(userId) : null;

  if (!orderId || !paymentId || !signature) {
    const err = new Error('order_id, payment_id, and signature are required');
    err.status = 400;
    throw err;
  }

  const ok = verifyRazorpayPaymentSignature(orderId, paymentId, signature, env.razorpay.keySecret);
  if (!ok) {
    const err = new Error('Invalid payment signature');
    err.status = 400;
    throw err;
  }

  const rzp = getRazorpay();
  let payment;
  try {
    payment = await rzp.payments.fetch(paymentId);
  } catch (e) {
    const err = new Error('Could not verify payment with Razorpay');
    err.status = 502;
    throw err;
  }

  if (String(payment.order_id) !== String(orderId)) {
    const err = new Error('Payment does not belong to this order');
    err.status = 400;
    throw err;
  }

  if (String(payment.status) === 'authorized') {
    try {
      await rzp.payments.capture(paymentId, payment.amount, payment.currency);
      payment = await rzp.payments.fetch(paymentId);
    } catch (e) {
      const err = new Error('Could not capture payment');
      err.status = 502;
      throw err;
    }
  }

  if (String(payment.status) !== 'captured') {
    const err = new Error(`Payment is not completed (status: ${payment.status})`);
    err.status = 400;
    throw err;
  }

  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await finalizePaidOrder(conn, {
        tenantId: tid,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise: payment.amount,
        currency: payment.currency,
        userId: uid,
        paymentMethod: payment.method,
        rawPayload: payment,
      });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

export async function applyWebhookPaymentCaptured({
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  amountPaise,
  currency,
  paymentMethod,
  rawPayload,
}) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    const err = new Error('Invalid tenant in order metadata');
    err.status = 400;
    throw err;
  }

  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await finalizePaidOrder(conn, {
        tenantId: tid,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise,
        currency,
        userId: null,
        paymentMethod,
        rawPayload,
      });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

export async function listPayments(tenantId, { page = 1, limit = 20, search = '' } = {}) {
  const tid = Number(tenantId);
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * lim;
  const q = String(search || '').trim();
  const searchClause = q
    ? 'AND (tpt.razorpay_payment_id LIKE ? OR tpt.razorpay_order_id LIKE ?)'
    : '';
  const searchParams = q ? [`%${q}%`, `%${q}%`] : [];

  const countRows = await query(
    `SELECT COUNT(*) AS c FROM tenant_payment_transactions tpt
     WHERE tpt.tenant_id = ? AND tpt.deleted_at IS NULL ${searchClause}`,
    [tid, ...searchParams]
  );
  const total = Number(countRows?.[0]?.c || 0);

  const limN = Math.trunc(lim);
  const offN = Math.trunc(offset);
  const rows = await query(
    `SELECT tpt.id, tpt.razorpay_order_id, tpt.razorpay_payment_id, tpt.amount_paise, tpt.currency,
            tpt.status, tpt.payment_method, tpt.created_at,
            tpt.plan_id, sp.name AS plan_name, sp.code AS plan_code
     FROM tenant_payment_transactions tpt
     LEFT JOIN subscription_plans sp ON sp.id = tpt.plan_id
     WHERE tpt.tenant_id = ? AND tpt.deleted_at IS NULL ${searchClause}
     ORDER BY tpt.created_at DESC
     LIMIT ${limN} OFFSET ${offN}`,
    [tid, ...searchParams]
  );

  return { data: rows, total, page: p, limit: lim };
}

export async function listSubscriptions(tenantId, { page = 1, limit = 20 } = {}) {
  const tid = Number(tenantId);
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * lim;

  const countRows = await query(
    `SELECT COUNT(*) AS c FROM tenant_subscriptions WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tid]
  );
  const total = Number(countRows?.[0]?.c || 0);

  const limN = Math.trunc(lim);
  const offN = Math.trunc(offset);
  const rows = await query(
    `SELECT ts.id, ts.status, ts.current_period_start, ts.current_period_end,
            ts.razorpay_order_id, ts.razorpay_payment_id, ts.created_at,
            sp.name AS plan_name, sp.code AS plan_code, sp.billing_interval
     FROM tenant_subscriptions ts
     JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE ts.tenant_id = ? AND ts.deleted_at IS NULL
     ORDER BY ts.created_at DESC
     LIMIT ${limN} OFFSET ${offN}`,
    [tid]
  );

  return { data: rows, total, page: p, limit: lim };
}

export async function getCurrentSubscription(tenantId) {
  const tid = Number(tenantId);
  const rows = await query(
    `SELECT ts.id, ts.status, ts.current_period_start, ts.current_period_end,
            ts.razorpay_order_id, ts.razorpay_payment_id, ts.created_at,
            sp.id AS plan_id, sp.name AS plan_name, sp.code AS plan_code, sp.billing_interval
     FROM tenant_subscriptions ts
     JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE ts.tenant_id = ? AND ts.status = 'active' AND ts.deleted_at IS NULL
     ORDER BY ts.current_period_end DESC
     LIMIT 1`,
    [tid]
  );
  return rows?.[0] || null;
}
