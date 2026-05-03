import { env } from '../../config/env.js';
import { query } from '../../config/db.js';
import { verifyRazorpayWebhookSignature } from '../../services/billing/billingCore.js';
import * as billingService from '../../services/tenant/billingService.js';

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

    if (!orderId || !paymentId || !Number.isFinite(amount)) {
      return res.status(400).json({ error: 'Incomplete payment payload' });
    }

    if (String(entity.status) !== 'captured') {
      return res.json({ ok: true, ignored: entity.status });
    }

    const orderRows = await query(
      `SELECT tenant_id, status FROM tenant_billing_orders
       WHERE razorpay_order_id = ? AND deleted_at IS NULL LIMIT 1`,
      [orderId]
    );
    const orderRow = orderRows?.[0];

    if (!orderRow) {
      const existing = await query(
        `SELECT id FROM tenant_payment_transactions WHERE razorpay_payment_id = ? AND deleted_at IS NULL LIMIT 1`,
        [paymentId]
      );
      if (existing?.length) {
        return res.json({ ok: true, duplicate: true });
      }
      return res.status(404).json({ error: 'Checkout order not found' });
    }

    const tenantId = Number(orderRow.tenant_id);
    await billingService.applyWebhookPaymentCaptured({
      tenantId,
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      amountPaise: amount,
      currency,
      paymentMethod: method,
      rawPayload: entity,
    });

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}
