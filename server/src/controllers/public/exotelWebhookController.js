import { env } from '../../config/env.js';
import * as exotelWebhookService from '../../services/public/exotelWebhookService.js';

function readWebhookToken(req) {
  const header = req.headers['x-exotel-token'] || req.headers['x-webhook-token'];
  return String(header || '').trim();
}

export async function status(req, res, next) {
  try {
    const expected = String(env.telephony.exotelWebhookToken || '').trim();
    if (expected) {
      const provided = readWebhookToken(req);
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Invalid Exotel webhook token' });
      }
    }
    const data = await exotelWebhookService.handleExotelStatusCallback(req.body || {});
    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}
