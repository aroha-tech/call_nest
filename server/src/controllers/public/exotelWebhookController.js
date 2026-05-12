import { env } from '../../config/env.js';
import * as exotelWebhookService from '../../services/public/exotelWebhookService.js';
import { findAccountByWebhookToken } from '../../services/tenant/telephony/tenantTelephonyAccountsService.js';

function readWebhookToken(req) {
  const header = req.headers['x-exotel-token'] || req.headers['x-webhook-token'];
  return String(header || '').trim();
}

/**
 * Legacy/global status callback handler. Used by the platform's default Exotel account
 * and by any default-account tenants. Validates the shared env token if configured.
 */
export async function status(req, res, next) {
  try {
    const expected = String(env.telephony.exotelWebhookToken || '').trim();
    if (expected) {
      const provided = readWebhookToken(req);
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Invalid Exotel webhook token' });
      }
    }
    const data = await exotelWebhookService.handleExotelStatusCallback(req.body || {}, {
      webhookToken: null,
    });
    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * Per-tenant status callback handler. The token lives in the URL itself
 * (/api/public/telephony/exotel/status/:tenant_token) so Exotel doesn't need to send a
 * custom header. We also accept an x-exotel-token header for extra defense in depth —
 * if the BYO account stored an exotel_webhook_token in its credentials, it must match.
 */
export async function statusForTenant(req, res, next) {
  try {
    const tenantToken = String(req.params.tenant_token || '').trim();
    if (!tenantToken) {
      return res.status(400).json({ error: 'Missing tenant_token in URL' });
    }
    const account = await findAccountByWebhookToken(tenantToken);
    if (!account) {
      return res.status(401).json({ error: 'Unknown tenant webhook token' });
    }
    const data = await exotelWebhookService.handleExotelStatusCallback(req.body || {}, {
      webhookToken: tenantToken,
    });
    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}
