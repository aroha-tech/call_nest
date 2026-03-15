/**
 * Microsoft Outlook OAuth2: auth URL and code exchange.
 * Requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET. Redirect URI must be set in Azure App registration.
 */
import { env } from '../../config/env.js';
import { encodeState } from './oauthState.js';

const SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'https://outlook.office365.com/IMAP.AccessAsUser.All',
  'https://outlook.office365.com/SMTP.Send',
];

function getRedirectUri() {
  return (
    env.microsoftRedirectUri ||
    `${env.apiBaseUrl.replace(/\/$/, '')}/api/tenant/email/oauth/outlook/callback`
  );
}

const TENANT = env.microsoftTenant || 'common';
const AUTH_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;

/**
 * @param {{ tenantId: number, userId: number }} context
 * @returns {{ url: string } | { error: string }}
 */
export function getAuthUrl(context) {
  if (!env.microsoftClientId || !env.microsoftClientSecret) {
    return {
      error:
        'Microsoft OAuth is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)',
    };
  }
  const state = encodeState(context);
  const params = new URLSearchParams({
    client_id: env.microsoftClientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES.join(' '),
    state,
    response_mode: 'query',
  });
  return { url: `${AUTH_URL}?${params.toString()}` };
}

/**
 * Exchange authorization code for tokens and get user email from id_token or userinfo.
 * @param {string} code
 * @returns {Promise<{ access_token: string, refresh_token?: string, email: string, expires_at?: number } | { error: string }>}
 */
export async function exchangeCodeForTokens(code) {
  if (!env.microsoftClientId || !env.microsoftClientSecret) {
    return { error: 'Microsoft OAuth is not configured' };
  }
  const body = new URLSearchParams({
    client_id: env.microsoftClientId,
    client_secret: env.microsoftClientSecret,
    code,
    redirect_uri: getRedirectUri(),
    grant_type: 'authorization_code',
  });
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        error: data.error_description || data.error || `HTTP ${res.status}`,
      };
    }
    const access_token = data.access_token;
    const refresh_token = data.refresh_token;
    let email = '';
    if (data.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(data.id_token.split('.')[1], 'base64').toString('utf8')
        );
        email = payload.email || payload.preferred_username || payload.upn || '';
      } catch (_) {}
    }
    const expires_in = data.expires_in;
    const expires_at = expires_in
      ? Math.floor(Date.now() / 1000) + Number(expires_in)
      : null;
    return {
      access_token,
      refresh_token,
      email,
      expires_at,
    };
  } catch (err) {
    return { error: err.message || 'Failed to exchange code for tokens' };
  }
}
