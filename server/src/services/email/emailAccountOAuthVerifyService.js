/**
 * Proves OAuth still works: refresh when a refresh token exists, otherwise probe the access token.
 */
import * as emailAccountService from '../tenant/emailAccountService.js';
import * as googleOAuth from './googleOAuthService.js';
import * as outlookOAuth from './outlookOAuthService.js';

const CLEAR_OAUTH_ERR = {
  oauth_last_error_at: null,
  oauth_last_error_code: null,
  oauth_last_error_detail: null,
};

export async function verifyOAuthConnection(tenantId, accountId, userId) {
  const account = await emailAccountService.findById(tenantId, accountId);
  if (!account) {
    const err = new Error('Email account not found');
    err.status = 404;
    throw err;
  }
  const provider = String(account.provider || '').toLowerCase();
  if (provider !== 'gmail' && provider !== 'outlook') {
    const err = new Error(
      'Verify is only available for Gmail or Microsoft Outlook OAuth accounts'
    );
    err.status = 400;
    throw err;
  }

  try {
    const verifiedAt = new Date();

    if (provider === 'gmail') {
      if (account.refresh_token) {
        const refreshed = await googleOAuth.refreshAccessToken(account.refresh_token);
        if (refreshed?.error) {
          const err = new Error(refreshed.error);
          err.status = 400;
          err.code = 'OAUTH_VERIFY_FAILED';
          throw err;
        }
        await emailAccountService.update(tenantId, account.id, {
          ...CLEAR_OAUTH_ERR,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || account.refresh_token,
          token_expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000) : null,
          oauth_last_verified_at: verifiedAt,
        }, userId);
        return { ok: true, provider };
      }
      if (!account.access_token) {
        const err = new Error('No access token or refresh token — reconnect the Gmail account.');
        err.status = 400;
        throw err;
      }
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${account.access_token}` },
      });
      if (!res.ok) {
        const err = new Error('Gmail rejected the access token — reconnect the account.');
        err.status = 400;
        err.code = 'OAUTH_VERIFY_FAILED';
        throw err;
      }
      await emailAccountService.update(
        tenantId,
        account.id,
        { ...CLEAR_OAUTH_ERR, oauth_last_verified_at: verifiedAt },
        userId
      );
      return { ok: true, provider };
    }

    if (account.refresh_token) {
      const refreshed = await outlookOAuth.refreshAccessToken(account.refresh_token);
      if (refreshed?.error) {
        const err = new Error(refreshed.error);
        err.status = 400;
        err.code = 'OAUTH_VERIFY_FAILED';
        throw err;
      }
      await emailAccountService.update(tenantId, account.id, {
        ...CLEAR_OAUTH_ERR,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token || account.refresh_token,
        token_expires_at: refreshed.expires_at ? new Date(refreshed.expires_at * 1000) : null,
        oauth_last_verified_at: verifiedAt,
      }, userId);
      return { ok: true, provider };
    }
    if (!account.access_token) {
      const err = new Error('No access token or refresh token — reconnect the Outlook account.');
      err.status = 400;
      throw err;
    }
    const res = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${account.access_token}` },
    });
    if (!res.ok) {
      const err = new Error('Microsoft Graph rejected the access token — reconnect the account.');
      err.status = 400;
      err.code = 'OAUTH_VERIFY_FAILED';
      throw err;
    }
    await emailAccountService.update(
      tenantId,
      account.id,
      { ...CLEAR_OAUTH_ERR, oauth_last_verified_at: verifiedAt },
      userId
    );
    return { ok: true, provider };
  } catch (err) {
    await emailAccountService
      .recordOAuthConnectionFailureQuiet(
        tenantId,
        accountId,
        'OAUTH_VERIFY_FAILED',
        emailAccountService.sanitizeOAuthErrorDetail(err.message)
      )
      .catch(() => {});
    throw err;
  }
}
