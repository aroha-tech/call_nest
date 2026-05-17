import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { query, withConnection } from '../../config/db.js';
import { computePeriodEnd, verifyRazorpayPaymentSignature } from './billingCore.js';
import * as callCreditsService from './callCreditsService.js';
import { grantIncludedWalletCredit } from './telephonyWalletGrantService.js';
import {
  findById as findTelephonyPlanById,
  serializePlanForClient,
} from '../superAdmin/telephonyBillingPlansService.js';
import { resolvePlanCyclePrice, PLAN_BILLING_CYCLES } from '../../utils/planCyclePricing.js';
import {
  getActiveTelephonySubscription,
} from './telephonySubscriptionGuard.js';

export { getActiveTelephonySubscription, assertActiveTelephonySubscription } from './telephonySubscriptionGuard.js';

function assertRazorpayConfigured() {
  if (!env.razorpay?.keyId || !env.razorpay?.keySecret) {
    const err = new Error('Razorpay is not configured on the server (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)');
    err.status = 503;
    throw err;
  }
}

function getRazorpay() {
  assertRazorpayConfigured();
  return new Razorpay({
    key_id: env.razorpay.keyId,
    key_secret: env.razorpay.keySecret,
  });
}

function formatMysqlUtc(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function computeSubscriptionPeriodEnd(start, plan, billingInterval) {
  if (plan.is_free_trial === 1) {
    const days = Math.max(1, Math.floor(Number(plan.trial_duration_days) || 14));
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + days);
    return end;
  }
  const iv = PLAN_BILLING_CYCLES.includes(billingInterval)
    ? billingInterval
    : plan.billing_interval === 'year' ||
        plan.billing_interval === 'quarter' ||
        plan.billing_interval === 'semiannual'
      ? plan.billing_interval
      : 'month';
  return computePeriodEnd(start, iv, 1);
}

async function loadAssignablePlan(planId) {
  const plan = await findTelephonyPlanById(planId);
  if (!plan || plan.deleted_at) {
    const err = new Error('Plan not found');
    err.status = 404;
    throw err;
  }
  if (!plan.is_active) {
    const err = new Error('Plan is not available');
    err.status = 400;
    throw err;
  }
  if (String(plan.plan_category) !== 'tenant_billing') {
    const err = new Error('Invalid plan type');
    err.status = 400;
    throw err;
  }
  return plan;
}

export async function getCurrentTelephonySubscription(tenantId) {
  const tid = Number(tenantId);
  const [row] = await query(
    `SELECT ts.id, ts.status, ts.current_period_start, ts.current_period_end, ts.auto_renew,
            ts.razorpay_order_id, ts.razorpay_payment_id, ts.razorpay_subscription_id, ts.created_at,
            p.id AS plan_id, p.code AS plan_code, p.name AS plan_name, p.plan_type,
            p.subscription_tier, p.billing_interval
     FROM tenant_telephony_subscriptions ts
     JOIN telephony_billing_plans p ON p.id = ts.telephony_billing_plan_id AND p.deleted_at IS NULL
     WHERE ts.tenant_id = ? AND ts.status = 'active' AND ts.deleted_at IS NULL
     ORDER BY ts.current_period_end DESC
     LIMIT 1`,
    [tid]
  );
  return row || null;
}

async function expirePreviousSubscriptions(conn, tenantId, userId) {
  await conn.execute(
    `UPDATE tenant_telephony_subscriptions
     SET status = 'expired', updated_by = ?, updated_at = UTC_TIMESTAMP()
     WHERE tenant_id = ? AND status = 'active' AND deleted_at IS NULL`,
    [userId ?? null, tenantId]
  );
}

/**
 * Activate subscription period, sync tenant plan fields, grant included wallet credit once per reference.
 */
export async function activateTelephonySubscription(
  conn,
  {
    tenantId,
    plan,
    periodStart = new Date(),
    autoRenew = false,
    razorpayOrderId = null,
    razorpayPaymentId = null,
    razorpaySubscriptionId = null,
    userId = null,
    grantSource = 'subscription_start',
    grantReference = null,
    billingInterval = null,
  }
) {
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;
  const start = periodStart instanceof Date ? periodStart : new Date(periodStart);
  const end = computeSubscriptionPeriodEnd(start, plan, billingInterval);

  await expirePreviousSubscriptions(conn, tid, uid);

  const cycleIv = billingInterval || plan.billing_interval || 'month';

  const [subRes] = await conn.execute(
    `INSERT INTO tenant_telephony_subscriptions (
       tenant_id, telephony_billing_plan_id, billing_interval, status,
       current_period_start, current_period_end, auto_renew,
       razorpay_order_id, razorpay_payment_id, razorpay_subscription_id,
       created_by, updated_by
     ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tid,
      plan.id,
      cycleIv,
      formatMysqlUtc(start),
      formatMysqlUtc(end),
      autoRenew ? 1 : 0,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySubscriptionId,
      uid,
      uid,
    ]
  );
  const subscriptionId = subRes.insertId;

  await conn.execute(
    `UPDATE tenants
     SET telephony_billing_plan_id = ?,
         call_billing_mode = ?,
         updated_at = NOW()
     WHERE id = ? AND is_deleted = 0`,
    [plan.id, plan.plan_type, tid]
  );

  const ref =
    grantReference ||
    (razorpayPaymentId
      ? `sub:${subscriptionId}:pay:${razorpayPaymentId}`
      : `sub:${subscriptionId}:start:${formatMysqlUtc(start)}`);

  let grant = { granted: false, reason: 'no_included_credit' };
  const amountPaise = Math.floor(Number(plan.included_wallet_credit_paise) || 0);
  if (amountPaise > 0) {
    grant = await grantIncludedWalletCredit(tid, plan, {
      grantSource,
      grantReference: ref,
      createdByUserId: uid,
    });
  }

  return {
    subscriptionId,
    period_start: formatMysqlUtc(start),
    period_end: formatMysqlUtc(end),
    grant,
    plan: serializePlanForClient(plan),
  };
}

/** Super-admin plan assignment: subscription period + included credits (no Razorpay). */
export async function activateFromAdminAssign(tenantId, planId, userId = null) {
  const plan = await loadAssignablePlan(planId);
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await activateTelephonySubscription(conn, {
        tenantId,
        plan,
        userId,
        grantSource: 'admin_assign',
        grantReference: `admin:${plan.id}:${Date.now()}`,
      });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

export async function ensureRazorpayPlan(plan) {
  if (plan.razorpay_plan_id) return String(plan.razorpay_plan_id).trim();
  const sale = Number(plan.sale_price_paise);
  if (!Number.isFinite(sale) || sale < 1) {
    const err = new Error('Plan has no sale price for recurring billing');
    err.status = 400;
    throw err;
  }
  const rzp = getRazorpay();
  const period = plan.billing_interval === 'year' ? 'yearly' : 'monthly';
  const rzpPlan = await rzp.plans.create({
    period,
    interval: 1,
    item: {
      name: String(plan.name).slice(0, 128),
      amount: sale,
      currency: 'INR',
      description: plan.description ? String(plan.description).slice(0, 255) : undefined,
    },
    notes: {
      telephony_plan_id: String(plan.id),
      telephony_plan_code: String(plan.code || ''),
    },
  });
  await query(
    `UPDATE telephony_billing_plans SET razorpay_plan_id = ?, updated_at = NOW() WHERE id = ?`,
    [rzpPlan.id, plan.id]
  );
  return rzpPlan.id;
}

export async function createSubscriptionCheckout(
  tenantId,
  userId,
  planId,
  { autoRenew = false, billingInterval = 'month' } = {}
) {
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;
  const plan = await loadAssignablePlan(Number(planId));

  if (plan.is_free_trial === 1) {
    const err = new Error('Free trial plans are assigned by your platform administrator only.');
    err.status = 403;
    err.code = 'FREE_PLAN_ADMIN_ONLY';
    throw err;
  }
  if (plan.is_contact_sales === 1) {
    const err = new Error('Contact sales for this plan.');
    err.status = 400;
    throw err;
  }

  const iv = PLAN_BILLING_CYCLES.includes(billingInterval) ? billingInterval : 'month';
  const cyclePrice = resolvePlanCyclePrice(plan, iv);
  const sale = Number(cyclePrice?.sale_price_paise);
  if (!Number.isFinite(sale) || sale < 1) {
    const err = new Error(`Plan has no sale price configured for ${iv} billing`);
    err.status = 400;
    throw err;
  }

  assertRazorpayConfigured();
  const rzp = getRazorpay();

  if (autoRenew && (iv === 'month' || iv === 'year')) {
    const rzpPlanId = await ensureRazorpayPlan(plan);
    const sub = await rzp.subscriptions.create({
      plan_id: rzpPlanId,
      total_count: 120,
      customer_notify: 1,
      notes: {
        tenant_id: String(tid),
        telephony_plan_id: String(plan.id),
        purchase_type: 'telephony_subscription',
      },
    });

    await query(
      `INSERT INTO tenant_telephony_subscription_orders (
         tenant_id, telephony_billing_plan_id, billing_interval, razorpay_subscription_id,
         amount_paise, auto_renew, currency, status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, 1, 'INR', 'pending', ?, ?)`,
      [tid, plan.id, iv, sub.id, sale, uid, uid]
    );

    return {
      checkoutType: 'subscription',
      subscriptionId: sub.id,
      keyId: env.razorpay.keyId,
      plan: serializePlanForClient(plan),
      autoRenew: true,
    };
  }

  const receipt = `s${tid}p${plan.id}${Date.now()}`.slice(0, 40);
  const order = await rzp.orders.create({
    amount: sale,
    currency: 'INR',
    receipt,
    notes: {
      tenant_id: String(tid),
      telephony_plan_id: String(plan.id),
      purchase_type: 'telephony_subscription',
    },
  });

  await query(
    `INSERT INTO tenant_telephony_subscription_orders (
       tenant_id, telephony_billing_plan_id, billing_interval, razorpay_order_id,
       amount_paise, auto_renew, currency, status, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, 0, 'INR', 'pending', ?, ?)`,
    [tid, plan.id, iv, order.id, sale, uid, uid]
  );

  return {
    checkoutType: 'order',
    orderId: order.id,
    amount: sale,
    currency: order.currency || 'INR',
    keyId: env.razorpay.keyId,
    plan: serializePlanForClient(plan),
    autoRenew: false,
  };
}

async function finalizeSubscriptionOrder(conn, {
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  amountPaise,
  userId,
}) {
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;

  const [rows] = await conn.execute(
    `SELECT o.id, o.tenant_id, o.telephony_billing_plan_id, o.billing_interval, o.amount_paise, o.status, o.auto_renew
     FROM tenant_telephony_subscription_orders o
     WHERE o.razorpay_order_id = ? AND o.tenant_id = ? AND o.deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [razorpayOrderId, tid]
  );
  const orderRow = rows?.[0];
  if (!orderRow) {
    const err = new Error('Checkout order not found');
    err.status = 404;
    throw err;
  }
  if (String(orderRow.status) === 'completed') {
    const current = await getCurrentTelephonySubscription(tid);
    return { duplicate: true, subscription: current };
  }

  if (Number(amountPaise) !== Number(orderRow.amount_paise)) {
    const err = new Error('Payment amount does not match order');
    err.status = 400;
    throw err;
  }

  const plan = await loadAssignablePlan(orderRow.telephony_billing_plan_id);
  const activation = await activateTelephonySubscription(conn, {
    tenantId: tid,
    plan,
    billingInterval: orderRow.billing_interval || 'month',
    autoRenew: Boolean(orderRow.auto_renew),
    razorpayOrderId,
    razorpayPaymentId,
    userId: uid,
    grantSource: 'subscription_start',
  });

  await conn.execute(
    `UPDATE tenant_telephony_subscription_orders
     SET status = 'completed', updated_by = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND deleted_at IS NULL`,
    [uid, orderRow.id]
  );

  try {
    await conn.execute(
      `INSERT INTO tenant_payment_transactions (
         tenant_id, subscription_id, plan_id, razorpay_order_id, razorpay_payment_id,
         amount_paise, currency, status, payment_method, raw_payload_json, created_by, updated_by
       ) VALUES (?, NULL, NULL, ?, ?, ?, 'INR', 'captured', 'razorpay', ?, ?, ?)`,
      [
        tid,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise,
        JSON.stringify({
          purchase_type: 'telephony_subscription',
          telephony_billing_plan_id: plan.id,
          telephony_subscription_id: activation.subscriptionId,
        }),
        uid,
        uid,
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_DUP_ENTRY') throw e;
  }

  return { duplicate: false, ...activation };
}

export async function verifySubscriptionCheckout(tenantId, userId, body) {
  assertRazorpayConfigured();
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;

  const orderId = body?.razorpay_order_id || body?.order_id;
  const paymentId = body?.razorpay_payment_id || body?.payment_id;
  const signature = body?.razorpay_signature || body?.signature;
  const subscriptionId = body?.razorpay_subscription_id || body?.subscription_id;

  if (subscriptionId && paymentId && signature) {
    const ok = verifyRazorpayPaymentSignature(paymentId, subscriptionId, env.razorpay.keySecret);
    if (!ok) {
      const err = new Error('Invalid payment signature');
      err.status = 400;
      throw err;
    }
    return applySubscriptionCharged({
      razorpaySubscriptionId: subscriptionId,
      razorpayPaymentId: paymentId,
      amountPaise: body?.amount_paise,
      userId: uid,
      tenantId: tid,
    });
  }

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
  } catch {
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
    } catch {
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
      const result = await finalizeSubscriptionOrder(conn, {
        tenantId: tid,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise: payment.amount,
        userId: uid,
      });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

/**
 * Razorpay autopay renewal (subscription.charged webhook or client verify).
 * Extends period and grants included credits idempotently per payment id.
 */
export async function applySubscriptionCharged({
  razorpaySubscriptionId,
  razorpayPaymentId,
  amountPaise = null,
  tenantId = null,
  userId = null,
}) {
  const subId = String(razorpaySubscriptionId || '').trim();
  const payId = String(razorpayPaymentId || '').trim();
  if (!subId) {
    const err = new Error('razorpay_subscription_id required');
    err.status = 400;
    throw err;
  }

  const [orderRows] = await query(
    `SELECT o.id, o.tenant_id, o.telephony_billing_plan_id, o.amount_paise, o.status
     FROM tenant_telephony_subscription_orders o
     WHERE o.razorpay_subscription_id = ? AND o.deleted_at IS NULL
     LIMIT 1`,
    [subId]
  );
  let orderRow = orderRows?.[0];

  if (!orderRow && tenantId) {
    const [byTenant] = await query(
      `SELECT o.id, o.tenant_id, o.telephony_billing_plan_id, o.amount_paise, o.status
       FROM tenant_telephony_subscription_orders o
       WHERE o.tenant_id = ? AND o.razorpay_subscription_id = ? AND o.deleted_at IS NULL
       LIMIT 1`,
      [Number(tenantId), subId]
    );
    orderRow = byTenant;
  }

  if (!orderRow) {
    const err = new Error('Subscription checkout order not found');
    err.status = 404;
    throw err;
  }

  const tid = Number(orderRow.tenant_id);
  const plan = await loadAssignablePlan(orderRow.telephony_billing_plan_id);

  const [existingSub] = await query(
    `SELECT id FROM tenant_telephony_subscriptions
     WHERE tenant_id = ? AND razorpay_subscription_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid, subId]
  );

  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      let result;
      if (!existingSub) {
        result = await activateTelephonySubscription(conn, {
          tenantId: tid,
          plan,
          autoRenew: true,
          razorpayPaymentId: payId || null,
          razorpaySubscriptionId: subId,
          userId,
          grantSource: 'subscription_start',
          grantReference: payId ? `sub:rzp:${subId}:pay:${payId}` : `sub:rzp:${subId}:start`,
        });
        await conn.execute(
          `UPDATE tenant_telephony_subscription_orders
           SET status = 'completed', updated_by = ?, updated_at = UTC_TIMESTAMP()
           WHERE id = ? AND deleted_at IS NULL`,
          [userId ?? null, orderRow.id]
        );
      } else {
        const now = new Date();
        const end = computeSubscriptionPeriodEnd(now, plan);
        await expirePreviousSubscriptions(conn, tid, userId);
        await conn.execute(
          `UPDATE tenant_telephony_subscriptions
           SET status = 'active',
               current_period_start = ?,
               current_period_end = ?,
               razorpay_payment_id = ?,
               updated_by = ?,
               updated_at = UTC_TIMESTAMP()
           WHERE id = ?`,
          [formatMysqlUtc(now), formatMysqlUtc(end), payId || null, userId ?? null, existingSub.id]
        );
        await conn.execute(
          `UPDATE tenants
           SET telephony_billing_plan_id = ?, call_billing_mode = ?, updated_at = NOW()
           WHERE id = ? AND is_deleted = 0`,
          [plan.id, plan.plan_type, tid]
        );
        const grant = payId
          ? await grantIncludedWalletCredit(tid, plan, {
              grantSource: 'subscription_renewal',
              grantReference: `sub:rzp:${subId}:renew:${payId}`,
              createdByUserId: userId,
            })
          : { granted: false, reason: 'no_payment_id' };
        result = {
          subscriptionId: existingSub.id,
          renewed: true,
          period_start: formatMysqlUtc(now),
          period_end: formatMysqlUtc(end),
          grant,
        };
      }

      if (payId && amountPaise != null) {
        try {
          await conn.execute(
            `INSERT INTO tenant_payment_transactions (
               tenant_id, subscription_id, plan_id, razorpay_order_id, razorpay_payment_id,
               amount_paise, currency, status, payment_method, raw_payload_json, created_by, updated_by
             ) VALUES (?, ?, NULL, ?, ?, ?, 'INR', 'captured', 'razorpay_autopay', ?, ?, ?)`,
            [
              tid,
              result.subscriptionId,
              subId,
              payId,
              amountPaise,
              JSON.stringify({
                purchase_type: 'telephony_subscription_renewal',
                razorpay_subscription_id: subId,
              }),
              userId ?? null,
              userId ?? null,
            ]
          );
        } catch (e) {
          if (e?.code !== 'ER_DUP_ENTRY') throw e;
        }
      }

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
  userId = null,
}) {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await finalizeSubscriptionOrder(conn, {
        tenantId,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise,
        userId,
      });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}

export async function listSubscriptionHistory(tenantId, { page = 1, limit = 20 } = {}) {
  const tid = Number(tenantId);
  const p = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (p - 1) * lim;

  const [countRow] = await query(
    `SELECT COUNT(*) AS c FROM tenant_telephony_subscriptions WHERE tenant_id = ? AND deleted_at IS NULL`,
    [tid]
  );
  const total = Number(countRow?.c || 0);
  const limN = Math.trunc(lim);
  const offN = Math.trunc(offset);

  const rows = await query(
    `SELECT ts.id, ts.status, ts.current_period_start, ts.current_period_end, ts.auto_renew,
            ts.razorpay_payment_id, ts.created_at,
            p.name AS plan_name, p.code AS plan_code, p.billing_interval, p.subscription_tier
     FROM tenant_telephony_subscriptions ts
     JOIN telephony_billing_plans p ON p.id = ts.telephony_billing_plan_id AND p.deleted_at IS NULL
     WHERE ts.tenant_id = ? AND ts.deleted_at IS NULL
     ORDER BY ts.created_at DESC
     LIMIT ${limN} OFFSET ${offN}`,
    [tid]
  );

  return { data: rows, total, page: p, limit: lim };
}
