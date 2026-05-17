import { env } from '../../config/env.js';
import { query } from '../../config/db.js';
import { verifyRazorpayWebhookSignature } from '../../services/billing/billingCore.js';
import * as billingService from '../../services/tenant/billingService.js';
import * as creditPurchaseService from '../../services/tenant/creditPurchaseService.js';
import * as telephonySubscriptionService from '../../services/billing/telephonySubscriptionService.js';

async function resolveTenantForOrder(orderId) {
  const [creditPack] = await query(
    `SELECT tenant_id, status FROM tenant_credit_purchase_orders
     WHERE razorpay_order_id = ? AND deleted_at IS NULL LIMIT 1`,
    [orderId]
  );
  if (creditPack) {
    return { tenantId: Number(creditPack.tenant_id), type: 'credit_pack' };
  }

  const [telephonySub] = await query(
    `SELECT tenant_id, status FROM tenant_telephony_subscription_orders
     WHERE razorpay_order_id = ? AND deleted_at IS NULL LIMIT 1`,
    [orderId]
  );
  if (telephonySub) {
    return { tenantId: Number(telephonySub.tenant_id), type: 'telephony_subscription' };
  }

  const [legacy] = await query(
    `SELECT tenant_id, status FROM tenant_billing_orders
     WHERE razorpay_order_id = ? AND deleted_at IS NULL LIMIT 1`,
    [orderId]
  );
  if (legacy) {
    return { tenantId: Number(legacy.tenant_id), type: 'legacy_subscription' };
  }

  return null;
}

export async function handleRazorpayWebhook(req, res, next) {
  try {
    if (!env.razorpay?.webhookSecret) {
      return res.status(503).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.get('x-razorpay-signature');
    const raw = req.body;
    if (!Buffer.isBuffer(raw)) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    if (!verifyRazorpayWebhookSignature(raw, signature, env.razorpay.webhookSecret)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    const event = payload?.event;

    if (event === 'subscription.charged') {
      const subEntity = payload?.payload?.subscription?.entity;
      const payEntity = payload?.payload?.payment?.entity;
      const subscriptionId = subEntity?.id || payEntity?.subscription_id;
      const paymentId = payEntity?.id;
      const amount = payEntity ? Number(payEntity.amount) : null;

      if (!subscriptionId) {
        return res.status(400).json({ error: 'Missing subscription id' });
      }

      await telephonySubscriptionService.applySubscriptionCharged({
        razorpaySubscriptionId: subscriptionId,
        razorpayPaymentId: paymentId,
        amountPaise: amount,
      });

      return res.json({ ok: true, handled: 'subscription.charged' });
    }

    if (event !== 'payment.captured') {
      return res.json({ ok: true, ignored: event || true });
    }

    const entity = payload?.payload?.payment?.entity;
    if (!entity) {
      return res.status(400).json({ error: 'Missing payment entity' });
    }

    const orderId = entity.order_id;
    const paymentId = entity.id;
    const amount = Number(entity.amount);
    const currency = entity.currency || 'INR';
    const method = entity.method || null;
    const subscriptionId = entity.subscription_id || null;

    if (subscriptionId && paymentId) {
      await telephonySubscriptionService.applySubscriptionCharged({
        razorpaySubscriptionId: subscriptionId,
        razorpayPaymentId: paymentId,
        amountPaise: Number.isFinite(amount) ? amount : null,
      });
      return res.json({ ok: true, handled: 'payment.captured.subscription' });
    }

    if (!orderId || !paymentId || !Number.isFinite(amount)) {
      return res.status(400).json({ error: 'Incomplete payment payload' });
    }

    if (String(entity.status) !== 'captured') {
      return res.json({ ok: true, ignored: entity.status });
    }

    const resolved = await resolveTenantForOrder(orderId);
    if (!resolved) {
      const existing = await query(
        `SELECT id FROM tenant_payment_transactions WHERE razorpay_payment_id = ? AND deleted_at IS NULL LIMIT 1`,
        [paymentId]
      );
      if (existing?.length) {
        return res.json({ ok: true, duplicate: true });
      }
      return res.status(404).json({ error: 'Checkout order not found' });
    }

    const { tenantId, type } = resolved;

    if (type === 'credit_pack') {
      await creditPurchaseService.applyWebhookPaymentCaptured({
        tenantId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise: amount,
      });
    } else if (type === 'telephony_subscription') {
      await telephonySubscriptionService.applyWebhookPaymentCaptured({
        tenantId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise: amount,
      });
    } else {
      await billingService.applyWebhookPaymentCaptured({
        tenantId,
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        amountPaise: amount,
        currency,
        paymentMethod: method,
        rawPayload: entity,
      });
    }

    return res.json({ ok: true, type });
  } catch (err) {
    return next(err);
  }
}
