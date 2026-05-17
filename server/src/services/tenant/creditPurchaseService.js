import Razorpay from 'razorpay';
import { env } from '../../config/env.js';
import { query, withConnection } from '../../config/db.js';
import { verifyRazorpayPaymentSignature, shortReceiptId } from '../billing/billingCore.js';
import * as callCreditsService from '../billing/callCreditsService.js';
import { getCurrentTelephonySubscription } from '../billing/telephonySubscriptionService.js';
import {
  findById as findTelephonyPlanById,
  serializePlanForClient,
} from '../superAdmin/telephonyBillingPlansService.js';

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

export function getPurchaseClientConfig() {
  return {
    razorpayKeyId: env.razorpay?.keyId || '',
    razorpayConfigured: Boolean(env.razorpay?.keyId && env.razorpay?.keySecret),
  };
}

/** Tenant must use credit billing with platform default calling account. */
export async function getPurchaseEligibility(tenantId) {
  const tid = Number(tenantId);
  const [row] = await query(
    `SELECT call_billing_mode, telephony_account_mode
     FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tid]
  );
  if (!row) {
    return { eligible: false, reason: 'Workspace not found' };
  }
  if (String(row.call_billing_mode) !== 'credit') {
    return {
      eligible: false,
      reason: 'Call credit packs are available when your workspace uses credit billing.',
    };
  }
  if (String(row.telephony_account_mode) !== 'default_account') {
    return {
      eligible: false,
      reason: 'Call credit packs are available with platform calling (default account), not BYO telephony.',
    };
  }
  return { eligible: true, reason: null };
}

export async function listPurchasePlansForTenant(tenantId) {
  const eligibility = await getPurchaseEligibility(tenantId);
  if (!eligibility.eligible) {
    return { eligible: false, reason: eligibility.reason, plans: [] };
  }

  const rows = await query(
    `SELECT *
     FROM telephony_billing_plans
     WHERE deleted_at IS NULL AND is_active = 1 AND plan_category = 'credit_purchase'
     ORDER BY sort_order ASC, name ASC`
  );

  return {
    eligible: true,
    reason: null,
    plans: rows.map(serializePlanForClient),
  };
}

/** Active tenant billing templates for the workspace's current credit vs unlimited mode. */
export async function listTenantBillingPlansForTenant(tenantId) {
  const tid = Number(tenantId);
  const [tenant] = await query(
    `SELECT call_billing_mode, telephony_account_mode, telephony_billing_plan_id
     FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tid]
  );
  if (!tenant) {
    return {
      callBillingMode: null,
      telephonyAccountMode: null,
      assignedPlanId: null,
      assignedPlan: null,
      plans: [],
    };
  }

  const mode = String(tenant.call_billing_mode || 'credit');

  const rows = await query(
    `SELECT *
     FROM telephony_billing_plans
     WHERE deleted_at IS NULL AND is_active = 1
       AND plan_category = 'tenant_billing'
     ORDER BY sort_order ASC, name ASC`
  );

  let assignedPlan = null;
  const assignedId = tenant.telephony_billing_plan_id
    ? Number(tenant.telephony_billing_plan_id)
    : null;
  if (assignedId) {
    const row = await findTelephonyPlanById(assignedId);
    if (row && !row.deleted_at && row.is_active) {
      assignedPlan = serializePlanForClient(row);
    }
  }

  return {
    callBillingMode: mode,
    telephonyAccountMode: String(tenant.telephony_account_mode || 'default_account'),
    assignedPlanId: assignedId,
    assignedPlan,
    plans: rows.map(serializePlanForClient),
  };
}

/** Full tenant-facing plans view: billing templates for current mode + optional credit top-up packs. */
export async function getTenantPlansView(tenantId) {
  const [billing, purchase, telephonySubscription] = await Promise.all([
    listTenantBillingPlansForTenant(tenantId),
    listPurchasePlansForTenant(tenantId),
    getCurrentTelephonySubscription(tenantId),
  ]);

  return {
    ...getPurchaseClientConfig(),
    callBillingMode: billing.callBillingMode,
    telephonyAccountMode: billing.telephonyAccountMode,
    assignedBillingPlan: billing.assignedPlan,
    assignedBillingPlanId: billing.assignedPlanId,
    tenantBillingPlans: billing.plans,
    telephonySubscription: telephonySubscription || null,
    creditPurchaseEligible: purchase.eligible,
    creditPurchaseReason: purchase.reason,
    /** @deprecated use creditPurchasePlans — kept for older clients */
    eligible: purchase.eligible,
    eligibilityReason: purchase.reason,
    plans: purchase.plans,
    creditPurchasePlans: purchase.plans,
  };
}

async function loadActivePurchasePlan(planId) {
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
  if (String(plan.plan_category) !== 'credit_purchase') {
    const err = new Error('Invalid plan type');
    err.status = 400;
    throw err;
  }
  const sale = Number(plan.sale_price_paise);
  const wallet = Number(plan.wallet_credit_paise);
  if (!Number.isFinite(sale) || sale < 1) {
    const err = new Error('Plan has no sale price configured');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(wallet) || wallet < 1) {
    const err = new Error('Plan has no wallet credit configured');
    err.status = 400;
    throw err;
  }
  return plan;
}

export async function createPurchaseOrder(tenantId, userId, planId) {
  const tid = Number(tenantId);
  const pid = Number(planId);
  const uid = userId != null ? Number(userId) : null;

  const eligibility = await getPurchaseEligibility(tid);
  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason || 'Not eligible for credit purchases');
    err.status = 403;
    throw err;
  }

  const plan = await loadActivePurchasePlan(pid);
  assertRazorpayConfigured();

  const amount = Number(plan.sale_price_paise);
  const rzp = getRazorpay();
  const receipt = `c${tid}p${pid}${Date.now()}`.slice(0, 40);

  const order = await rzp.orders.create({
    amount,
    currency: 'INR',
    receipt: receipt.slice(0, 40),
    notes: {
      tenant_id: String(tid),
      telephony_plan_id: String(pid),
      purchase_type: 'credit_pack',
    },
  });

  await query(
    `INSERT INTO tenant_credit_purchase_orders (
       tenant_id, telephony_billing_plan_id, razorpay_order_id, amount_paise,
       wallet_credit_paise, currency, status, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, 'INR', 'pending', ?, ?)`,
    [tid, pid, order.id, amount, Number(plan.wallet_credit_paise), uid, uid]
  );

  return {
    orderId: order.id,
    amount,
    currency: order.currency || 'INR',
    keyId: env.razorpay.keyId,
    plan: serializePlanForClient(plan),
  };
}

async function finalizeCreditPurchase(conn, {
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  amountPaise,
  userId,
}) {
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;

  const [rows] = await conn.execute(
    `SELECT o.id, o.tenant_id, o.telephony_billing_plan_id, o.amount_paise, o.wallet_credit_paise,
            o.status, p.name AS plan_name, p.code AS plan_code
     FROM tenant_credit_purchase_orders o
     JOIN telephony_billing_plans p ON p.id = o.telephony_billing_plan_id AND p.deleted_at IS NULL
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
    return { duplicate: true, wallet: await callCreditsService.getWallet(tid) };
  }

  if (Number(amountPaise) !== Number(orderRow.amount_paise)) {
    const err = new Error('Payment amount does not match order');
    err.status = 400;
    throw err;
  }

  const creditPaise = Number(orderRow.wallet_credit_paise);
  const note = `Credit pack: ${orderRow.plan_name || orderRow.plan_code} (order ${razorpayOrderId})`;

  await conn.execute(
    `INSERT IGNORE INTO tenant_call_credit_wallet (tenant_id, balance_paise) VALUES (?, 0)`,
    [tid]
  );
  const [walletRows] = await conn.execute(
    `SELECT balance_paise, lifetime_topup_paise FROM tenant_call_credit_wallet
     WHERE tenant_id = ? FOR UPDATE`,
    [tid]
  );
  const wallet = walletRows[0];
  const newBalance = Number(wallet.balance_paise) + creditPaise;
  const newTopup = Number(wallet.lifetime_topup_paise) + creditPaise;
  await conn.execute(
    `UPDATE tenant_call_credit_wallet
     SET balance_paise = ?, lifetime_topup_paise = ?, last_topup_at = UTC_TIMESTAMP()
     WHERE tenant_id = ?`,
    [newBalance, newTopup, tid]
  );
  await conn.execute(
    `INSERT INTO tenant_call_credit_ledger
       (tenant_id, call_attempt_id, entry_type, amount_paise, balance_after_paise, note, created_by)
     VALUES (?, NULL, 'topup', ?, ?, ?, ?)`,
    [tid, creditPaise, newBalance, note.slice(0, 255), uid]
  );

  await conn.execute(
    `UPDATE tenant_credit_purchase_orders
     SET status = 'completed', razorpay_payment_id = ?, updated_by = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND deleted_at IS NULL`,
    [razorpayPaymentId, uid, orderRow.id]
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
          purchase_type: 'credit_pack',
          telephony_billing_plan_id: orderRow.telephony_billing_plan_id,
          plan_name: orderRow.plan_name,
          wallet_credit_paise: creditPaise,
        }),
        uid,
        uid,
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_DUP_ENTRY') throw e;
  }

  return {
    duplicate: false,
    wallet: { tenant_id: tid, balance_paise: newBalance },
    credited_paise: creditPaise,
  };
}

export async function verifyPurchasePayment(tenantId, userId, body) {
  assertRazorpayConfigured();
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
      const result = await finalizeCreditPurchase(conn, {
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

export async function applyWebhookPaymentCaptured({
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  amountPaise,
}) {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await finalizeCreditPurchase(conn, {
        tenantId,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise,
        userId: null,
      });
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    }
  });
}
