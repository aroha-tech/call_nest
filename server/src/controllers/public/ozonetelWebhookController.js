import { env } from '../../config/env.js';
import * as ozonetelWebhookService from '../../services/public/ozonetelWebhookService.js';

function readWebhookToken(req) {
  const header = req.headers['x-ozonetel-token'] || req.headers['x-webhook-token'];
  return String(header || '').trim();
}

export async function status(req, res, next) {
  try {
    const expected = String(env.telephony.ozonetelWebhookToken || '').trim();
    if (expected) {
      const provided = readWebhookToken(req);
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Invalid Ozonetel webhook token' });
      }
    }
    const data = await ozonetelWebhookService.handleOzonetelStatusCallback(req.body || {});
    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

