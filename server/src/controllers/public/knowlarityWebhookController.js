import { env } from '../../config/env.js';
import * as knowlarityWebhookService from '../../services/public/knowlarityWebhookService.js';

function readWebhookToken(req) {
  const header = req.headers['x-knowlarity-token'] || req.headers['x-webhook-token'];
  return String(header || '').trim();
}

export async function status(req, res, next) {
  try {
    const expected = String(env.telephony.knowlarityWebhookToken || '').trim();
    if (expected) {
      const provided = readWebhookToken(req);
      if (!provided || provided !== expected) {
        return res.status(401).json({ error: 'Invalid Knowlarity webhook token' });
      }
    }
    const data = await knowlarityWebhookService.handleKnowlarityStatusCallback(req.body || {});
    return res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

