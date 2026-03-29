/**
 * Microsoft Outlook OAuth2: auth URL and code exchange.
 * Requires MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET. Redirect URI must be set in Azure App registration.
 */
import { env } from '../../config/env.js';
import { encodeState } from './oauthState.js';

// OAuth scopes for Outlook via Microsoft Graph + basic profile.
// IMPORTANT: You cannot mix Graph scopes (Mail.Send) with legacy Outlook
// resource scopes (IMAP/SMTP). To avoid AADSTS70011 \"scopes not compatible\",
// we request only Graph + OpenID scopes here.
const SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'Mail.Send',
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
 * @param {{ tenantId: number, userId: number, returnOrigin?: string }} context
 * @returns {{ url: string } | { error: string }}
 */
export function getAuthUrl(context) {
  if (!env.microsoftClientId || !env.microsoftClientSecret) {
    return {
      error:
        'Microsoft OAuth is not configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET)',
    };
  }
  const state = encodeState({
    tenantId: context.tenantId,
    userId: context.userId,
    ...(context.returnOrigin ? { returnOrigin: context.returnOrigin } : {}),
  });
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
    scope: SCOPES.join(' '),
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

/**
 * Refresh access token using refresh_token (v2.0 endpoint).
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_at?: number } | { error: string }>}
 */
export async function refreshAccessToken(refreshToken) {
  if (!env.microsoftClientId || !env.microsoftClientSecret) {
    return { error: 'Microsoft OAuth is not configured' };
  }
  if (!refreshToken) {
    return { error: 'Missing refresh token' };
  }
  const body = new URLSearchParams({
    client_id: env.microsoftClientId,
    client_secret: env.microsoftClientSecret,
    refresh_token: refreshToken,
    redirect_uri: getRedirectUri(),
    grant_type: 'refresh_token',
    scope: SCOPES.join(' '),
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
    const expires_in = data.expires_in;
    const expires_at = expires_in
      ? Math.floor(Date.now() / 1000) + Number(expires_in)
      : null;
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at,
    };
  } catch (err) {
    return { error: err.message || 'Failed to refresh access token' };
  }
}
