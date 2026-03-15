import * as emailMessageService from '../../services/tenant/emailMessageService.js';
import { syncGmailForTenant } from '../../services/email/gmailSyncService.js';

export async function getAll(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const contact_id = req.query.contact_id || null;
    const email_account_id = req.query.email_account_id || null;
    const direction = req.query.direction || null;
    const status = req.query.status || null;
    const folder = req.query.folder || 'inbox'; // inbox | sent
    const search = req.query.search && String(req.query.search).trim() !== '' ? req.query.search.trim() : null;
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;

    // Minimal auto-sync: when loading inbox, pull recent Gmail messages into email_messages.
    if (folder === 'inbox') {
      try {
        await syncGmailForTenant(tenantId, req.user.id);
      } catch (syncErr) {
        // Log but do not fail the request if sync has issues.
        console.error('Gmail sync failed (ignored for getAll):', syncErr);
      }
    }

    const [messages, total] = await Promise.all([
      emailMessageService.findAll(tenantId, {
        contact_id,
        email_account_id,
        direction,
        status,
        folder,
        search,
        limit,
        offset,
      }),
      emailMessageService.countAll(tenantId, {
        contact_id,
        email_account_id,
        direction,
        status,
        folder,
        search,
      }),
    ]);
    res.json({ data: messages, total });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const message = await emailMessageService.findById(tenantId, req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Email message not found' });
    }
    const attachments = await emailMessageService.getAttachments(tenantId, message.id);
    res.json({ data: { ...message, attachments } });
  } catch (err) {
    next(err);
  }
}

export async function getThread(req, res, next) {
  try {
    const tenantId = req.tenant.id;
    const threadId = req.params.threadId;
    const messages = await emailMessageService.findByThreadId(tenantId, threadId);
    res.json({ data: messages });
  } catch (err) {
    next(err);
  }
}
