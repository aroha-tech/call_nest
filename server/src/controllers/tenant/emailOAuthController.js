/**
 * Email OAuth: start Gmail/Outlook connect flow and handle callbacks.
 * Start routes require auth; callbacks are called by the provider (no auth).
 */
import { env } from '../../config/env.js';
import { decodeState } from '../../services/email/oauthState.js';
import * as googleOAuth from '../../services/email/googleOAuthService.js';
import * as outlookOAuth from '../../services/email/outlookOAuthService.js';
import * as emailAccountService from '../../services/tenant/emailAccountService.js';

const FRONTEND_ACCOUNTS = `${env.frontendUrl.replace(/\/$/, '')}/email/accounts`;

function redirectSuccess(res, message = 'Account connected') {
  res.redirect(`${FRONTEND_ACCOUNTS}?oauth=success&message=${encodeURIComponent(message)}`);
}

function redirectError(res, errMsg) {
  res.redirect(`${FRONTEND_ACCOUNTS}?oauth=error&message=${encodeURIComponent(errMsg || 'Connection failed')}`);
}

/** GET /oauth/google/url — returns { url } for redirect. Requires auth. */
export function getGoogleUrl(req, res) {
  const tenantId = req.tenant?.id;
  const userId = req.user?.id;
  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = googleOAuth.getAuthUrl({ tenantId, userId });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ url: result.url });
}

/** GET /oauth/google/callback — no auth; called by Google with ?code=&state= */
export async function callbackGoogle(req, res) {
  const { code, state } = req.query;
  const payload = decodeState(state);
  if (!payload) {
    return redirectError(res, 'Invalid or expired state. Please try again.');
  }
  if (!code) {
    return redirectError(res, 'Missing authorization code.');
  }
  const tokens = await googleOAuth.exchangeCodeForTokens(code);
  if (tokens.error) {
    return redirectError(res, tokens.error);
  }
  const email = (tokens.email || '').trim();
  if (!email) {
    return redirectError(res, 'Could not read email from Google.');
  }
  const { tenantId, userId } = payload;
  const tokenExpiresAt = tokens.expires_at
    ? new Date(tokens.expires_at * 1000)
    : null;
  try {
    const existing = await emailAccountService.findByEmail(tenantId, email);
    if (existing) {
      await emailAccountService.update(tenantId, existing.id, {
        provider: 'gmail',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
      }, userId);
      return redirectSuccess(res, `${email} reconnected.`);
    }
    await emailAccountService.create(tenantId, {
      provider: 'gmail',
      email_address: email,
      account_name: email,
      display_name: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
      status: 'active',
    }, userId);
    return redirectSuccess(res, `${email} connected.`);
  } catch (err) {
    console.error('Email OAuth callback error:', err);
    return redirectError(res, err.message || 'Failed to save account.');
  }
}

/** GET /oauth/outlook/url — returns { url } for redirect. Requires auth. */
export function getOutlookUrl(req, res) {
  const tenantId = req.tenant?.id;
  const userId = req.user?.id;
  if (!tenantId || !userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const result = outlookOAuth.getAuthUrl({ tenantId, userId });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ url: result.url });
}

/** GET /oauth/outlook/callback — no auth; called by Microsoft with ?code=&state= */
export async function callbackOutlook(req, res) {
  const { code, state } = req.query;
  const payload = decodeState(state);
  if (!payload) {
    return redirectError(res, 'Invalid or expired state. Please try again.');
  }
  if (!code) {
    return redirectError(res, 'Missing authorization code.');
  }
  const tokens = await outlookOAuth.exchangeCodeForTokens(code);
  if (tokens.error) {
    return redirectError(res, tokens.error);
  }
  const email = (tokens.email || '').trim();
  if (!email) {
    return redirectError(res, 'Could not read email from Microsoft.');
  }
  const { tenantId, userId } = payload;
  const tokenExpiresAt = tokens.expires_at
    ? new Date(tokens.expires_at * 1000)
    : null;
  try {
    const existing = await emailAccountService.findByEmail(tenantId, email);
    if (existing) {
      await emailAccountService.update(tenantId, existing.id, {
        provider: 'outlook',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: tokenExpiresAt,
      }, userId);
      return redirectSuccess(res, `${email} reconnected.`);
    }
    await emailAccountService.create(tenantId, {
      provider: 'outlook',
      email_address: email,
      account_name: email,
      display_name: email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: tokenExpiresAt,
      status: 'active',
    }, userId);
    return redirectSuccess(res, `${email} connected.`);
  } catch (err) {
    console.error('Email OAuth callback error:', err);
    return redirectError(res, err.message || 'Failed to save account.');
  }
}
