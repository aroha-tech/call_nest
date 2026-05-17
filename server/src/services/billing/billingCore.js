import crypto from 'crypto';

/**
 * @param {Date} start
 * @param {'month'|'quarter'|'semiannual'|'year'} billingInterval
 * @param {number} intervalCount
 */
export function computePeriodEnd(start, billingInterval, intervalCount) {
  const d = new Date(start.getTime());
  const n = Math.max(1, Number(intervalCount) || 1);
  if (billingInterval === 'year') {
    d.setUTCFullYear(d.getUTCFullYear() + n);
    return d;
  }
  const monthsPerUnit =
    billingInterval === 'quarter' ? 3 : billingInterval === 'semiannual' ? 6 : 1;
  d.setUTCMonth(d.getUTCMonth() + monthsPerUnit * n);
  return d;
}

export function verifyRazorpayPaymentSignature(orderId, paymentId, signature, keySecret) {
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex').toLowerCase();
  const got = String(signature).toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(got, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyRazorpayWebhookSignature(rawBodyBuffer, signatureHeader, webhookSecret) {
  if (!webhookSecret || !rawBodyBuffer || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBodyBuffer).digest('hex').toLowerCase();
  const got = String(signatureHeader).toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(got, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function shortReceiptId(tenantId, planId) {
  const base = `r${tenantId}p${planId}${Date.now()}`;
  return base.length <= 40 ? base : base.slice(0, 40);
}
