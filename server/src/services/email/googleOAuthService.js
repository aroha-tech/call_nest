/**
 * Gmail OAuth2: auth URL and code exchange.
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Redirect URI must be set in Google Cloud Console.
 */
import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { encodeState } from './oauthState.js';

const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://mail.google.com/',
];

/** Used by OAuth flows and Gmail API client (must match Google Cloud redirect URI). */
export function getRedirectUri() {
  return (
    env.googleRedirectUri ||
    `${env.apiBaseUrl.replace(/\/$/, '')}/api/tenant/email/oauth/google/callback`
  );
}

/**
 * @param {{ tenantId: number, userId: number, returnOrigin?: string }} context
 * @returns {{ url: string } | { error: string }}
 */
export function getAuthUrl(context) {
  if (!env.googleClientId || !env.googleClientSecret) {
    return { error: 'Gmail OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' };
  }
  const client = new OAuth2Client(
    env.googleClientId,
    env.googleClientSecret,
    getRedirectUri()
  );
  const state = encodeState({
    tenantId: context.tenantId,
    userId: context.userId,
    ...(context.returnOrigin ? { returnOrigin: context.returnOrigin } : {}),
  });
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
  return { url };
}

/**
 * Exchange authorization code for tokens and get user email.
 * @param {string} code
 * @returns {Promise<{ access_token: string, refresh_token?: string, email: string, expires_at?: number } | { error: string }>}
 */
export async function exchangeCodeForTokens(code) {
  if (!env.googleClientId || !env.googleClientSecret) {
    return { error: 'Gmail OAuth is not configured' };
  }
  const client = new OAuth2Client(
    env.googleClientId,
    env.googleClientSecret,
    getRedirectUri()
  );
  try {
    const { tokens } = await client.getToken(code);
    const idToken = tokens.id_token;
    let email = '';
    if (idToken) {
      const payload = JSON.parse(
        Buffer.from(idToken.split('.')[1], 'base64').toString('utf8')
      );
      email = payload.email || payload.preferred_username || '';
    }
    if (!email && tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({ idToken: tokens.id_token });
        const payload = ticket.getPayload();
        email = payload?.email || '';
      } catch (_) {}
    }
    const expiresAt = tokens.expiry_date
      ? Math.floor(tokens.expiry_date / 1000)
      : null;
    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || undefined,
      email,
      expires_at: expiresAt,
    };
  } catch (err) {
    return { error: err.message || 'Failed to exchange code for tokens' };
  }
}

/**
 * Refresh Gmail access token (used before SMTP send when token is expired/near expiry).
 * @param {string} refreshToken
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_at: number | null } | { error: string }>}
 */
export async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    return { error: 'No refresh token. Reconnect the Gmail account under Email Accounts.' };
  }
  if (!env.googleClientId || !env.googleClientSecret) {
    return { error: 'Gmail OAuth is not configured' };
  }
  const client = new OAuth2Client(
    env.googleClientId,
    env.googleClientSecret,
    getRedirectUri()
  );
  try {
    client.setCredentials({ refresh_token: refreshToken });
    await client.getAccessToken();
    const creds = client.credentials;
    if (!creds.access_token) {
      return { error: 'Google did not return an access token' };
    }
    const expiresAt = creds.expiry_date
      ? Math.floor(creds.expiry_date / 1000)
      : null;
    return {
      access_token: creds.access_token,
      refresh_token: creds.refresh_token || refreshToken,
      expires_at: expiresAt,
    };
  } catch (err) {
    return { error: err.message || 'Failed to refresh Gmail token' };
  }
}
