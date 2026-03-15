/**
 * Public webhook for provider message status callbacks (Twilio, etc.).
 * No tenant auth; tenant is resolved from account (e.g. Twilio AccountSid = our external_account_id).
 */
import { query } from '../config/db.js';
import * as whatsappMessageService from '../services/tenant/whatsappMessageService.js';

/** Map Twilio MessageStatus to our status. Twilio: queued, sent, delivered, read, failed. */
function mapStatus(providerStatus) {
  const s = (providerStatus || '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'read') return 'read';
  if (s === 'failed' || s === 'undelivered') return 'failed';
  if (s === 'sent') return 'sent';
  return null;
}

/**
 * POST body (Twilio-style): AccountSid, MessageSid, MessageStatus.
 * Or generic: account_id (our internal), provider_message_id, status.
 */
export async function messageStatus(req, res, next) {
  try {
    const body = req.body || {};
    let tenantId = null;
    let providerMessageId = body.MessageSid || body.provider_message_id;
    let status = mapStatus(body.MessageStatus || body.status);

    if (!providerMessageId || !status) {
      return res.status(400).json({ error: 'Missing provider_message_id (MessageSid) or status (MessageStatus)' });
    }

    if (body.account_id) {
      const [acc] = await query('SELECT tenant_id FROM whatsapp_accounts WHERE id = ? LIMIT 1', [body.account_id]);
      if (!acc) return res.status(404).json({ error: 'Account not found' });
      tenantId = acc.tenant_id;
    } else if (body.AccountSid) {
      const [acc] = await query(
        'SELECT tenant_id FROM whatsapp_accounts WHERE external_account_id = ? LIMIT 1',
        [body.AccountSid]
      );
      if (!acc) {
        return res.status(404).json({ error: 'Account not found for this provider account' });
      }
      tenantId = acc.tenant_id;
    } else {
      return res.status(400).json({ error: 'Provide account_id or AccountSid' });
    }

    const timestamps = {};
    if (status === 'delivered') timestamps.delivered_at = new Date();
    if (status === 'read') timestamps.read_at = new Date();

    const updated = await whatsappMessageService.updateStatusByProviderMessageId(
      tenantId,
      providerMessageId,
      status,
      timestamps
    );
    if (!updated) {
      return res.status(404).json({ error: 'Message not found' });
    }
    res.json({ ok: true, message: updated });
  } catch (err) {
    next(err);
  }
}
