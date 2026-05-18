import { assertRazorpayConfigured, createRazorpaySdk } from '../billing/razorpayClient.js';
import { isDevMockPayment } from '../billing/razorpayConfigService.js';
import { query, withConnection } from '../../config/db.js';
import { verifyRazorpayPaymentSignature } from '../billing/billingCore.js';
import {
  findById as findTelephonyPlanById,
  serializePlanForClient,
} from '../superAdmin/telephonyBillingPlansService.js';
import {
  applySeatPurchaseFromPlan,
  getSeatLimitsSummary,
} from '../billing/seatEntitlementService.js';
import { computePlanChargePaise } from '../../utils/planTaxUtils.js';

export async function listSeatPlansForTenant(tenantId) {
  const tid = Number(tenantId);
  const [tenant] = await query(
    `SELECT id FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
    [tid]
  );
  if (!tenant) {
    return { eligible: false, reason: 'Workspace not found', plans: [] };
  }

  const rows = await query(
    `SELECT *
     FROM telephony_billing_plans
     WHERE deleted_at IS NULL AND is_active = 1 AND plan_category = 'seat_purchase'
       AND billing_interval = 'one_time'
     ORDER BY sort_order ASC, seat_role ASC, includes_unlimited_channels DESC, name ASC`
  );

  return {
    eligible: rows.length > 0,
    reason: rows.length ? null : 'No seat add-on plans are configured yet.',
    plans: rows.map(serializePlanForClient),
  };
}

async function loadActiveSeatPlan(planId) {
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
  if (String(plan.plan_category) !== 'seat_purchase') {
    const err = new Error('Invalid plan type');
    err.status = 400;
    throw err;
  }
  if (String(plan.billing_interval) !== 'one_time') {
    const err = new Error('Seat add-ons must be one-time purchase plans');
    err.status = 400;
    throw err;
  }
  const role = String(plan.seat_role || '');
  if (!['admin', 'manager', 'agent'].includes(role)) {
    const err = new Error('Seat plan has no valid seat_role');
    err.status = 400;
    throw err;
  }
  const unit = Number(plan.sale_price_paise);
  if (!Number.isFinite(unit) || unit < 1) {
    const err = new Error('Plan has no sale price configured');
    err.status = 400;
    throw err;
  }
  return plan;
}

export async function createSeatPurchaseOrder(tenantId, userId, planId, quantity = 1) {
  const tid = Number(tenantId);
  const pid = Number(planId);
  const uid = userId != null ? Number(userId) : null;
  const qty = Math.min(50, Math.max(1, Math.floor(Number(quantity) || 1)));

  const plan = await loadActiveSeatPlan(pid);
  const cfg = await assertRazorpayConfigured();

  const unitPrice = computePlanChargePaise(plan, plan.sale_price_paise);
  const amount = unitPrice * qty;

  if (cfg.devMock) {
    const orderId = `dev_seat_${tid}_${pid}_${Date.now()}`;
    await query(
      `INSERT INTO tenant_seat_purchase_orders (
         tenant_id, telephony_billing_plan_id, seat_role, includes_unlimited_channels,
         quantity, razorpay_order_id, amount_paise, currency, status, created_by, updated_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', 'pending', ?, ?)`,
      [
        tid,
        pid,
        plan.seat_role,
        plan.includes_unlimited_channels ? 1 : 0,
        qty,
        orderId,
        amount,
        uid,
        uid,
      ]
    );
    return {
      orderId,
      amount,
      currency: 'INR',
      keyId: cfg.keyId || 'dev_mock',
      devMock: true,
      quantity: qty,
      plan: serializePlanForClient(plan),
    };
  }

  const rzp = await createRazorpaySdk();
  const receipt = `s${tid}p${pid}q${qty}`.slice(0, 40);

  const order = await rzp.orders.create({
    amount,
    currency: 'INR',
    receipt: receipt.slice(0, 40),
    notes: {
      tenant_id: String(tid),
      telephony_plan_id: String(pid),
      purchase_type: 'seat_pack',
      quantity: String(qty),
    },
  });

  await query(
    `INSERT INTO tenant_seat_purchase_orders (
       tenant_id, telephony_billing_plan_id, seat_role, includes_unlimited_channels,
       quantity, razorpay_order_id, amount_paise, currency, status, created_by, updated_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', 'pending', ?, ?)`,
    [
      tid,
      pid,
      plan.seat_role,
      plan.includes_unlimited_channels ? 1 : 0,
      qty,
      order.id,
      amount,
      uid,
      uid,
    ]
  );

  return {
    orderId: order.id,
    amount,
    currency: order.currency || 'INR',
    keyId: cfg.keyId,
    quantity: qty,
    plan: serializePlanForClient(plan),
  };
}

async function finalizeSeatPurchase(conn, {
  tenantId,
  razorpayOrderId,
  razorpayPaymentId,
  amountPaise,
  userId,
}) {
  const tid = Number(tenantId);
  const uid = userId != null ? Number(userId) : null;

  const [rows] = await conn.execute(
    `SELECT o.id, o.tenant_id, o.telephony_billing_plan_id, o.seat_role,
            o.includes_unlimited_channels, o.quantity, o.amount_paise, o.status,
            p.name AS plan_name, p.code AS plan_code, p.seat_role AS plan_seat_role,
            p.includes_unlimited_channels AS plan_includes_channels
     FROM tenant_seat_purchase_orders o
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
    return { duplicate: true, seatLimits: await getSeatLimitsSummary(tid) };
  }

  if (Number(amountPaise) !== Number(orderRow.amount_paise)) {
    const err = new Error('Payment amount does not match order');
    err.status = 400;
    throw err;
  }

  const plan = await findTelephonyPlanById(orderRow.telephony_billing_plan_id);
  const qty = Number(orderRow.quantity) || 1;
  await applySeatPurchaseFromPlan(tid, plan, qty, uid);

  await conn.execute(
    `UPDATE tenant_seat_purchase_orders
     SET status = 'completed', razorpay_payment_id = ?, updated_by = ?, updated_at = UTC_TIMESTAMP()
     WHERE id = ? AND deleted_at IS NULL`,
    [razorpayPaymentId, uid, orderRow.id]
  );

  try {
    await conn.execute(
      `INSERT INTO tenant_payment_transactions (
         tenant_id, subscription_id, plan_id, razorpay_order_id, razorpay_payment_id,
         amount_paise, currency, status, payment_method, raw_payload_json, created_by, updated_by
       ) VALUES (?, NULL, ?, ?, ?, ?, 'INR', 'captured', 'razorpay', ?, ?, ?)`,
      [
        tid,
        orderRow.telephony_billing_plan_id,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise,
        JSON.stringify({
          purchase_type: 'seat_pack',
          seat_role: orderRow.seat_role,
          quantity: qty,
          includes_unlimited_channels: orderRow.includes_unlimited_channels,
          plan_name: orderRow.plan_name,
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
    seatLimits: await getSeatLimitsSummary(tid),
    quantity: qty,
  };
}

export async function verifySeatPurchasePayment(tenantId, userId, body) {
  await assertRazorpayConfigured();
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

  if (isDevMockPayment(body)) {
    const [orderRow] = await query(
      `SELECT amount_paise FROM tenant_seat_purchase_orders
       WHERE razorpay_order_id = ? AND tenant_id = ? AND deleted_at IS NULL LIMIT 1`,
      [orderId, tid]
    );
    if (!orderRow) {
      const err = new Error('Checkout order not found');
      err.status = 404;
      throw err;
    }
    return withConnection(async (conn) => {
      await conn.beginTransaction();
      try {
        const result = await finalizeSeatPurchase(conn, {
          tenantId: tid,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          amountPaise: orderRow.amount_paise,
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

  const cfg = await assertRazorpayConfigured();
  const ok = verifyRazorpayPaymentSignature(orderId, paymentId, signature, cfg.keySecret);
  if (!ok) {
    const err = new Error('Invalid payment signature');
    err.status = 400;
    throw err;
  }

  const rzp = await createRazorpaySdk();
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
      const result = await finalizeSeatPurchase(conn, {
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
      const result = await finalizeSeatPurchase(conn, {
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
