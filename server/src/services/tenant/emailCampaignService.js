import { query } from '../../config/db.js';
import * as emailAccountService from './emailAccountService.js';
import * as emailTemplateService from './emailTemplateService.js';
import * as sendEmailService from '../email/sendEmailService.js';
import {
  JOB_TYPES,
  createJob,
  updateJobProgress,
  completeJob,
  failJob,
  isJobCancelled,
} from './tenantBackgroundJobService.js';
import { createAndDispatchNotification } from './notificationService.js';

const CAMPAIGN_STATUSES = new Set([
  'draft',
  'scheduled',
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function normalizeEmail(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || !raw.includes('@')) return null;
  return raw;
}

async function loadContactsForRecipients(tenantId, contactIds = []) {
  const ids = [...new Set(contactIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return query(
    `SELECT id, display_name, email
     FROM contacts
     WHERE tenant_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    [tenantId, ...ids]
  );
}

async function buildRecipientRows(tenantId, input) {
  const recipients = [];
  const seen = new Set();

  const pushRecipient = (recipient) => {
    const email = normalizeEmail(recipient.email);
    if (!email || seen.has(email)) return;
    seen.add(email);
    recipients.push({
      contact_id: recipient.contact_id ?? null,
      recipient_name: recipient.recipient_name ?? null,
      recipient_email: email,
    });
  };

  for (const item of asArray(input.recipient_emails)) {
    if (typeof item === 'string') {
      pushRecipient({ email: item });
    } else if (item && typeof item === 'object') {
      pushRecipient({
        email: item.email,
        recipient_name: item.name || item.recipient_name || null,
      });
    }
  }

  const contacts = await loadContactsForRecipients(tenantId, asArray(input.contact_ids));
  for (const c of contacts) {
    pushRecipient({
      email: c.email,
      recipient_name: c.display_name || null,
      contact_id: c.id,
    });
  }

  return recipients;
}

export async function listCampaigns(tenantId, filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;
  const status = filters.status ? String(filters.status).trim().toLowerCase() : null;
  const search = filters.search ? String(filters.search).trim() : null;

  let where = 'WHERE c.tenant_id = ? AND c.deleted_at IS NULL';
  const params = [tenantId];

  if (status && CAMPAIGN_STATUSES.has(status)) {
    where += ' AND c.status = ?';
    params.push(status);
  }
  if (search) {
    where += ' AND (c.name LIKE ? OR c.description LIKE ?)';
    const term = `%${search.replace(/%/g, '\\%')}%`;
    params.push(term, term);
  }

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT c.*,
              ea.email_address AS account_email,
              ea.account_name AS account_name,
              t.name AS template_name
       FROM email_campaigns c
       LEFT JOIN email_accounts ea ON ea.id = c.email_account_id AND ea.tenant_id = c.tenant_id
       LEFT JOIN email_module_templates t ON t.id = c.template_id AND t.tenant_id = c.tenant_id
       ${where}
       ORDER BY c.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*) AS total FROM email_campaigns c ${where}`, params),
  ]);

  return {
    data: rows || [],
    total: countRows?.[0]?.total ?? 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((countRows?.[0]?.total ?? 0) / limit)),
  };
}

export async function getCampaignById(tenantId, campaignId) {
  const [campaign] = await query(
    `SELECT c.*,
            ea.email_address AS account_email,
            ea.account_name AS account_name,
            t.name AS template_name
     FROM email_campaigns c
     LEFT JOIN email_accounts ea ON ea.id = c.email_account_id AND ea.tenant_id = c.tenant_id
     LEFT JOIN email_module_templates t ON t.id = c.template_id AND t.tenant_id = c.tenant_id
     WHERE c.id = ? AND c.tenant_id = ? AND c.deleted_at IS NULL
     LIMIT 1`,
    [campaignId, tenantId]
  );
  if (!campaign) return null;

  const [recipientSummary] = await query(
    `SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count
     FROM email_campaign_recipients
     WHERE tenant_id = ? AND campaign_id = ? AND deleted_at IS NULL`,
    [tenantId, campaignId]
  );

  return {
    ...campaign,
    recipient_summary: {
      pending: Number(recipientSummary?.pending_count ?? 0),
      sent: Number(recipientSummary?.sent_count ?? 0),
      failed: Number(recipientSummary?.failed_count ?? 0),
      skipped: Number(recipientSummary?.skipped_count ?? 0),
    },
  };
}

export async function createCampaign(tenantId, userId, payload = {}) {
  const name = String(payload.name || '').trim();
  const description = payload.description != null ? String(payload.description).trim() : null;
  const emailAccountId = Number(payload.email_account_id);
  const templateId = payload.template_id != null ? Number(payload.template_id) : null;
  const status = payload.schedule_at ? 'scheduled' : 'draft';
  const scheduleAt = payload.schedule_at ? new Date(payload.schedule_at) : null;
  const subject = payload.subject != null ? String(payload.subject) : null;
  const bodyHtml = payload.body_html != null ? String(payload.body_html) : null;
  const bodyText = payload.body_text != null ? String(payload.body_text) : null;

  if (!name) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(emailAccountId) || emailAccountId <= 0) {
    const err = new Error('email_account_id is required');
    err.status = 400;
    throw err;
  }

  const account = await emailAccountService.findActiveById(tenantId, emailAccountId);
  if (!account) {
    const err = new Error('Email account not found or inactive');
    err.status = 400;
    throw err;
  }
  if (templateId) {
    const template = await emailTemplateService.findById(tenantId, templateId);
    if (!template) {
      const err = new Error('Template not found');
      err.status = 400;
      throw err;
    }
  }

  const recipients = await buildRecipientRows(tenantId, payload);
  if (!recipients.length) {
    const err = new Error('At least one recipient is required');
    err.status = 400;
    throw err;
  }

  const insertCampaign = await query(
    `INSERT INTO email_campaigns
      (tenant_id, name, description, email_account_id, template_id, subject, body_html, body_text,
       status, schedule_at, total_recipients, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      tenantId,
      name,
      description,
      emailAccountId,
      templateId,
      subject,
      bodyHtml,
      bodyText,
      status,
      scheduleAt,
      recipients.length,
      userId ?? null,
      userId ?? null,
    ]
  );
  const campaignId = Number(insertCampaign.insertId);

  if (recipients.length) {
    const values = recipients
      .map(() => '(?, ?, ?, ?, ?, ?, ?)')
      .join(', ');
    const params = [];
    for (const r of recipients) {
      params.push(
        tenantId,
        campaignId,
        r.contact_id ?? null,
        r.recipient_name ?? null,
        r.recipient_email,
        userId ?? null,
        userId ?? null
      );
    }
    await query(
      `INSERT INTO email_campaign_recipients
        (tenant_id, campaign_id, contact_id, recipient_name, recipient_email, created_by, updated_by)
       VALUES ${values}`,
      params
    );
  }

  return getCampaignById(tenantId, campaignId);
}

export async function listCampaignRecipients(tenantId, campaignId, filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
  const offset = (page - 1) * limit;
  const status = filters.status ? String(filters.status).trim().toLowerCase() : null;

  let where = 'WHERE tenant_id = ? AND campaign_id = ? AND deleted_at IS NULL';
  const params = [tenantId, campaignId];
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  const [rows, countRows] = await Promise.all([
    query(
      `SELECT id, campaign_id, contact_id, recipient_name, recipient_email, status, error_message, sent_at, email_message_id, created_at
       FROM email_campaign_recipients
       ${where}
       ORDER BY id ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*) AS total FROM email_campaign_recipients ${where}`, params),
  ]);
  return {
    data: rows || [],
    total: countRows?.[0]?.total ?? 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((countRows?.[0]?.total ?? 0) / limit)),
  };
}

export async function queueCampaign(tenantId, campaignId, userId) {
  const campaign = await getCampaignById(tenantId, campaignId);
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  if (!['draft', 'scheduled', 'paused', 'failed'].includes(campaign.status)) {
    const err = new Error(`Campaign cannot be queued from status: ${campaign.status}`);
    err.status = 409;
    throw err;
  }

  await query(
    `UPDATE email_campaigns
     SET status = 'queued', updated_by = ?, updated_at = CURRENT_TIMESTAMP, last_error = NULL
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [userId ?? null, campaignId, tenantId]
  );

  const jobId = await createJob(tenantId, userId, {
    jobType: JOB_TYPES.EMAIL_CAMPAIGN_SEND,
    payload: { campaign_id: Number(campaignId) },
  });

  return { job_id: jobId };
}

async function markCampaignAggregates(tenantId, campaignId, userId, forceStatus = null, errorMessage = null) {
  const [row] = await query(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
     FROM email_campaign_recipients
     WHERE tenant_id = ? AND campaign_id = ? AND deleted_at IS NULL`,
    [tenantId, campaignId]
  );
  const pendingCount = Number(row?.pending_count ?? 0);
  const sentCount = Number(row?.sent_count ?? 0);
  const failedCount = Number(row?.failed_count ?? 0);

  let status = forceStatus;
  if (!status) {
    if (pendingCount > 0) status = 'running';
    else if (sentCount > 0) status = 'completed';
    else status = 'failed';
  }

  await query(
    `UPDATE email_campaigns
     SET sent_count = ?, failed_count = ?, status = ?, completed_at = CASE WHEN ? IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END,
         updated_by = ?, updated_at = CURRENT_TIMESTAMP, last_error = ?
     WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
    [
      sentCount,
      failedCount,
      status,
      status,
      userId ?? null,
      errorMessage,
      campaignId,
      tenantId,
    ]
  );
}

export async function runCampaignSendJob(jobRow) {
  const tenantId = Number(jobRow.tenant_id);
  const jobId = Number(jobRow.id);
  const userId = jobRow.created_by ? Number(jobRow.created_by) : null;
  const payload = jobRow.payload_json && typeof jobRow.payload_json === 'object'
    ? jobRow.payload_json
    : JSON.parse(String(jobRow.payload_json || '{}'));
  const campaignId = Number(payload.campaign_id);

  if (!campaignId) {
    await failJob(tenantId, jobId, 'Missing campaign_id in payload');
    return;
  }

  try {
    const campaign = await getCampaignById(tenantId, campaignId);
    if (!campaign) {
      await failJob(tenantId, jobId, 'Campaign not found');
      return;
    }

    await query(
      `UPDATE email_campaigns
       SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_by = ?, updated_at = CURRENT_TIMESTAMP, last_error = NULL
       WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL`,
      [userId ?? null, campaignId, tenantId]
    );

    const [countRow] = await query(
      `SELECT COUNT(*) AS total
       FROM email_campaign_recipients
       WHERE tenant_id = ? AND campaign_id = ? AND status = 'pending' AND deleted_at IS NULL`,
      [tenantId, campaignId]
    );
    const totalPending = Number(countRow?.total ?? 0);
    await updateJobProgress(tenantId, jobId, {
      total: totalPending,
      processed: 0,
      progressPercent: 0,
      step: 'sending',
    });

    let processed = 0;
    while (true) {
      if (await isJobCancelled(jobId)) {
        await markCampaignAggregates(tenantId, campaignId, userId, 'cancelled', 'Cancelled by user');
        return;
      }

      const recipients = await query(
        `SELECT id, contact_id, recipient_name, recipient_email
         FROM email_campaign_recipients
         WHERE tenant_id = ? AND campaign_id = ? AND status = 'pending' AND deleted_at IS NULL
         ORDER BY id ASC
         LIMIT 100`,
        [tenantId, campaignId]
      );
      if (!recipients.length) break;

      for (const recipient of recipients) {
        if (await isJobCancelled(jobId)) {
          await markCampaignAggregates(tenantId, campaignId, userId, 'cancelled', 'Cancelled by user');
          return;
        }
        try {
          const message = await sendEmailService.sendEmail(
            tenantId,
            {
              email_account_id: campaign.email_account_id,
              to: recipient.recipient_email,
              template_id: campaign.template_id || null,
              subject: campaign.subject || undefined,
              body_html: campaign.body_html || undefined,
              body_text: campaign.body_text || undefined,
              contact_id: recipient.contact_id || null,
              body_parameters: {
                contact_name: recipient.recipient_name || '',
                recipient_email: recipient.recipient_email,
              },
            },
            userId
          );

          await query(
            `UPDATE email_campaign_recipients
             SET status = 'sent', sent_at = NOW(), email_message_id = ?, error_message = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND tenant_id = ?`,
            [message?.id ?? null, userId ?? null, recipient.id, tenantId]
          );
        } catch (err) {
          await query(
            `UPDATE email_campaign_recipients
             SET status = 'failed', error_message = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ? AND tenant_id = ?`,
            [String(err?.message || 'Send failed').slice(0, 65000), userId ?? null, recipient.id, tenantId]
          );
        }

        processed += 1;
        await updateJobProgress(tenantId, jobId, {
          processed,
          total: totalPending,
          progressPercent: totalPending ? Math.floor((processed / totalPending) * 100) : 100,
          step: 'sending',
        });
      }
    }

    await markCampaignAggregates(tenantId, campaignId, userId);
    const completedCampaign = await getCampaignById(tenantId, campaignId);
    await createAndDispatchNotification(tenantId, userId, {
      moduleKey: 'email',
      eventType: 'campaign_completed',
      severity: 'normal',
      title: `Email campaign completed: ${completedCampaign?.name || `#${campaignId}`}`,
      body: `Sent: ${completedCampaign?.sent_count || 0}, Failed: ${completedCampaign?.failed_count || 0}`,
      entityType: 'email_campaign',
      entityId: campaignId,
      ctaPath: '/email/sent',
      eventHash: `email:campaign:completed:${tenantId}:${campaignId}:${jobId}`,
    });
    await completeJob(tenantId, jobId, {
      result: { campaign_id: campaignId, processed },
    });
  } catch (err) {
    await markCampaignAggregates(
      tenantId,
      campaignId,
      userId,
      'failed',
      String(err?.message || 'Campaign send failed').slice(0, 65000)
    );
    await createAndDispatchNotification(tenantId, userId, {
      moduleKey: 'email',
      eventType: 'campaign_failed',
      severity: 'high',
      title: `Email campaign failed (#${campaignId})`,
      body: String(err?.message || 'Campaign send failed'),
      entityType: 'email_campaign',
      entityId: campaignId,
      ctaPath: '/email/sent',
      eventHash: `email:campaign:failed:${tenantId}:${campaignId}:${jobId}`,
    });
    await failJob(tenantId, jobId, err?.message || 'Campaign send failed');
  }
}
