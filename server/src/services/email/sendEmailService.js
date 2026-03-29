/**
 * Send email using the client's connected account (SMTP or OAuth).
 * Gmail uses the Gmail REST API (HTTPS) so sends work when outbound SMTP (587/465) is blocked.
 * Outlook uses Microsoft Graph; SMTP uses nodemailer.
 */
import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { env } from '../../config/env.js';
import * as emailAccountService from '../tenant/emailAccountService.js';
import * as emailMessageService from '../tenant/emailMessageService.js';
import * as emailTemplateService from '../tenant/emailTemplateService.js';
import * as outlookOAuth from './outlookOAuthService.js';
import * as googleOAuth from './googleOAuthService.js';

/** Prevent SMTP OAuth handshakes from hanging indefinitely (nodemailer default is no timeout). */
const SMTP_TIMEOUT_MS = {
  connectionTimeout: 25_000,
  greetingTimeout: 25_000,
  socketTimeout: 90_000,
};

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
      ...SMTP_TIMEOUT_MS,
    });
  }

  throw new Error(`Unsupported email provider: ${provider}`);
}

/**
 * Send via Gmail API (HTTPS only — avoids SMTP blocked by many cloud firewalls).
 */
async function sendViaGmailRestApi(account, mailOptions) {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new Error('Gmail send requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  }
  if (!account.access_token) {
    throw new Error('Gmail account has no access token');
  }

  const oauth2 = new OAuth2Client(
    env.googleClientId,
    env.googleClientSecret,
    googleOAuth.getRedirectUri()
  );
  oauth2.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  const mimeBuffer = await new MailComposer(mailOptions).compile().build();
  const raw = mimeBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  try {
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    return res.data.id || res.data.threadId || null;
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.errors?.[0]?.message ||
      err?.message ||
      'Gmail send failed';
    throw new Error(msg);
  }
}

/**
 * Refresh Gmail OAuth token when expired or about to expire (Outlook does this before Graph send).
 */
async function ensureFreshGmailAccessToken(account, tenantId, updatedBy) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = account.token_expires_at
    ? Math.floor(new Date(account.token_expires_at).getTime() / 1000)
    : null;

  const needsRefresh =
    !account.access_token ||
    (expiresAtSec != null && expiresAtSec <= nowSec + 60) ||
    (expiresAtSec == null && account.refresh_token);

  if (!needsRefresh) return account;

  if (!account.refresh_token) {
    const err = new Error(
      'Gmail access expired and no refresh token is stored. Reconnect the account under Email Accounts.'
    );
    err.status = 400;
    throw err;
  }

  const refreshed = await googleOAuth.refreshAccessToken(account.refresh_token);
  if (refreshed?.error) {
    const err = new Error(refreshed.error);
    err.status = 400;
    throw err;
  }

  await emailAccountService.update(
    tenantId,
    account.id,
    {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || account.refresh_token,
      token_expires_at: refreshed.expires_at
        ? new Date(refreshed.expires_at * 1000)
        : null,
    },
    updatedBy
  );
  account.access_token = refreshed.access_token;
  if (refreshed.refresh_token) account.refresh_token = refreshed.refresh_token;
  account.token_expires_at = refreshed.expires_at
    ? new Date(refreshed.expires_at * 1000)
    : account.token_expires_at;
  return account;
}

/**
 * Replace simple {{variable}} in template body/subject.
 */
function applyTemplateVariables(text, variables = {}) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

function toRecipientArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendViaMicrosoftGraph(account, mail) {
  if (!account.access_token) {
    throw new Error('Email account is configured for Outlook OAuth but has no access token');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = account.token_expires_at
    ? Math.floor(new Date(account.token_expires_at).getTime() / 1000)
    : null;

  // Refresh token if expired (or about to expire within 60s)
  if (expiresAtSec && expiresAtSec <= nowSec + 60 && account.refresh_token) {
    const refreshed = await outlookOAuth.refreshAccessToken(account.refresh_token);
    if (refreshed?.error) {
      throw new Error(refreshed.error);
    }
    await emailAccountService.update(
      account.tenant_id,
      account.id,
      {
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || account.refresh_token,
        token_expires_at: refreshed.expires_at
          ? new Date(refreshed.expires_at * 1000)
          : null,
      },
      // If you later want full audit attribution, pass the current userId down into sendEmail().
      undefined
    );
    account.access_token = refreshed.access_token;
    if (refreshed.refresh_token) account.refresh_token = refreshed.refresh_token;
    account.token_expires_at = refreshed.expires_at
      ? new Date(refreshed.expires_at * 1000)
      : account.token_expires_at;
  }

  const toRecipients = toRecipientArray(mail.to).map((address) => ({
    emailAddress: { address },
  }));
  const ccRecipients = toRecipientArray(mail.cc).map((address) => ({
    emailAddress: { address },
  }));
  const bccRecipients = toRecipientArray(mail.bcc).map((address) => ({
    emailAddress: { address },
  }));

  const contentType = mail.html ? 'HTML' : 'Text';
  const content = mail.html || mail.text || '';

  const graphMessage = {
    subject: mail.subject || '',
    body: { contentType, content },
    toRecipients,
    ...(ccRecipients.length ? { ccRecipients } : {}),
    ...(bccRecipients.length ? { bccRecipients } : {}),
  };

  if (Array.isArray(mail.attachments) && mail.attachments.length) {
    graphMessage.attachments = mail.attachments.map((a) => {
      const isBuffer = a.content && typeof a.content !== 'string' && Buffer.isBuffer(a.content);
      const contentBytes = isBuffer ? a.content.toString('base64') : String(a.content || '');
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename,
        contentType: a.contentType || 'application/octet-stream',
        contentBytes,
      };
    });
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${account.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: graphMessage, saveToSentItems: true }),
  });

  if (!res.ok) {
    let details = '';
    try {
      const data = await res.json();
      details = data?.error?.message ? ` ${data.error.message}` : '';
    } catch (_) {}
    throw new Error(`Microsoft Graph sendMail failed (HTTP ${res.status}).${details}`.trim());
  }
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

  let messageId = null;
  const provider = (account.provider || '').toLowerCase();
  if (provider === 'outlook') {
    await sendViaMicrosoftGraph(account, mailOptions);
  } else if (provider === 'gmail') {
    await ensureFreshGmailAccessToken(account, tenantId, createdBy);
    messageId = await sendViaGmailRestApi(account, mailOptions);
  } else {
    const transporter = getTransporter(account);
    const info = await transporter.sendMail(mailOptions);
    messageId = info.messageId || null;
  }

  const threadId = `thread-${Date.now()}`;

  const message = await emailMessageService.create(
    tenantId,
    {
      email_account_id: account.id,
      contact_id: contact_id || null,
      thread_id: threadId,
      message_id_header: messageId,
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
