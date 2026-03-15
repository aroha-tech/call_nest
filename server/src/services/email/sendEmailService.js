/**
 * Send email using the client's connected account (SMTP or OAuth).
 * Uses nodemailer; for Gmail/Outlook OAuth the account must have valid access_token/refresh_token.
 */
import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import * as emailAccountService from '../tenant/emailAccountService.js';
import * as emailMessageService from '../tenant/emailMessageService.js';
import * as emailTemplateService from '../tenant/emailTemplateService.js';

/**
 * Build transporter for the given account (SMTP or OAuth2).
 */
function getTransporter(account) {
  const provider = (account.provider || 'smtp').toLowerCase();

  if (provider === 'smtp') {
    return nodemailer.createTransport({
      host: account.smtp_host,
      port: account.smtp_port || 587,
      secure: !!account.smtp_secure,
      auth: {
        user: account.smtp_user,
        pass: account.smtp_password_encrypted || account.smtp_password,
      },
    });
  }

  if (provider === 'gmail' || provider === 'outlook') {
    // OAuth2: use stored access_token. Refresh flow should run separately (cron or on send failure).
    if (!account.access_token) {
      throw new Error('Email account is configured for OAuth but has no access token');
    }

    const baseAuth = {
      type: 'OAuth2',
      user: account.email_address,
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
    };

    // Gmail requires clientId/clientSecret on the OAuth2 config, otherwise it can return:
    // "invalid_request: Could not determine client ID from request."
    const auth =
      provider === 'gmail'
        ? {
            ...baseAuth,
            clientId: env.googleClientId,
            clientSecret: env.googleClientSecret,
          }
        : baseAuth;

    return nodemailer.createTransport({
      service: provider === 'gmail' ? 'gmail' : 'hotmail',
      auth,
    });
  }

  throw new Error(`Unsupported email provider: ${provider}`);
}

/**
 * Replace simple {{variable}} in template body/subject.
 */
function applyTemplateVariables(text, variables = {}) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

/**
 * Send an email and persist to email_messages.
 * @param {number} tenantId
 * @param {object} payload - { email_account_id, to, cc?, bcc?, subject, body_html?, body_text?, template_id?, body_parameters?, contact_id?, attachments? }
 * @param {number} createdBy
 * @returns {Promise<object>} created email_message row
 */
export async function sendEmail(tenantId, payload, createdBy) {
  const {
    email_account_id,
    to,
    cc,
    bcc,
    subject,
    body_html,
    body_text,
    template_id,
    body_parameters = {},
    contact_id,
    attachments = [],
  } = payload;

  if (!email_account_id || !to) {
    const err = new Error('email_account_id and to are required');
    err.status = 400;
    throw err;
  }

  const account = await emailAccountService.findActiveById(tenantId, email_account_id);
  if (!account) {
    const err = new Error('Email account not found or inactive');
    err.status = 400;
    throw err;
  }

  let finalSubject = subject || '';
  let finalBodyHtml = body_html || null;
  let finalBodyText = body_text || null;

  if (template_id) {
    const template = await emailTemplateService.findById(tenantId, template_id);
    if (!template) {
      const err = new Error('Email template not found');
      err.status = 400;
      throw err;
    }
    finalSubject = applyTemplateVariables(template.subject, body_parameters);
    finalBodyHtml = template.body_html
      ? applyTemplateVariables(template.body_html, body_parameters)
      : null;
    finalBodyText = template.body_text
      ? applyTemplateVariables(template.body_text, body_parameters)
      : null;
  }

  const fromDisplay = account.display_name
    ? `"${account.display_name}" <${account.email_address}>`
    : account.email_address;

  const transporter = getTransporter(account);

  const mailOptions = {
    from: fromDisplay,
    to: Array.isArray(to) ? to.join(', ') : to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject: finalSubject,
    html: finalBodyHtml || undefined,
    text: finalBodyText || undefined,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  };

  const info = await transporter.sendMail(mailOptions);

  const threadId = `thread-${Date.now()}`;

  const message = await emailMessageService.create(
    tenantId,
    {
      email_account_id: account.id,
      contact_id: contact_id || null,
      thread_id: threadId,
      message_id_header: info.messageId || null,
      direction: 'outbound',
      status: 'sent',
      from_email: account.email_address,
      to_email: Array.isArray(to) ? to.join(', ') : to,
      cc_email: cc || null,
      bcc_email: bcc || null,
      subject: finalSubject,
      body_html: finalBodyHtml,
      body_text: finalBodyText,
      template_id: template_id || null,
      sent_at: new Date(),
      created_by: createdBy,
    },
    createdBy
  );

  return message;
}
