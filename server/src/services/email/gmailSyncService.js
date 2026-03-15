import { google } from 'googleapis';
import { env } from '../../config/env.js';
import * as emailAccountService from '../tenant/emailAccountService.js';
import * as emailMessageService from '../tenant/emailMessageService.js';
import { query } from '../../config/db.js';

function getOAuthClient(account) {
  const redirectUri =
    env.googleRedirectUri ||
    `${env.apiBaseUrl.replace(/\/$/, '')}/api/tenant/email/oauth/google/callback`;

  const oAuth2Client = new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    redirectUri
  );

  oAuth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
  });

  return oAuth2Client;
}

async function messageExists(tenantId, messageIdHeader) {
  if (!messageIdHeader) return false;
  const [row] = await query(
    'SELECT id FROM email_messages WHERE tenant_id = ? AND message_id_header = ? LIMIT 1',
    [tenantId, messageIdHeader]
  );
  return !!row;
}

function parseHeaders(headers = []) {
  const map = {};
  for (const h of headers) {
    if (h.name && h.value != null) {
      map[h.name.toLowerCase()] = h.value;
    }
  }
  return map;
}

/**
 * Sync recent inbox messages for a single Gmail account into email_messages.
 * Minimal v1: fetches last N messages in INBOX and inserts new ones.
 */
export async function syncGmailAccount(tenantId, account, createdBy, maxMessages = 20) {
  if (!account.access_token) {
    return { inserted: 0 };
  }

  const auth = getOAuthClient(account);
  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults: maxMessages,
  });

  const messages = listRes.data.messages || [];
  let inserted = 0;

  for (const m of messages) {
    const id = m.id;
    if (!id) continue;
    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'metadata',
      metadataHeaders: ['From', 'To', 'Subject', 'Date', 'Message-ID'],
    });

    const data = msgRes.data;
    const headers = parseHeaders(data.payload?.headers || []);
    const messageIdHeader = headers['message-id'] || null;

    const already = await messageExists(tenantId, messageIdHeader);
    if (already) continue;

    const from = headers['from'] || account.email_address;
    const to = headers['to'] || account.email_address;
    const subject = headers['subject'] || null;
    const dateHeader = headers['date'];
    const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

    await emailMessageService.create(tenantId, {
      email_account_id: account.id,
      direction: 'inbound',
      status: 'received',
      from_email: from,
      to_email: to,
      subject,
      body_html: null,
      body_text: data.snippet || null,
      message_id_header: messageIdHeader,
      received_at: receivedAt,
    }, createdBy);

    inserted += 1;
  }

  return { inserted };
}

/**
 * Sync Gmail inbox for all active Gmail accounts for the tenant.
 */
export async function syncGmailForTenant(tenantId, createdBy) {
  const accounts = await emailAccountService.findAllByProvider(tenantId, 'gmail', true);
  let totalInserted = 0;
  for (const account of accounts) {
    try {
      const { inserted } = await syncGmailAccount(tenantId, account, createdBy);
      totalInserted += inserted;
    } catch (err) {
      console.error(
        `Failed to sync Gmail for account ${account.id} (${account.email_address}):`,
        err
      );
    }
  }
  return { inserted: totalInserted };
}

