import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../../config/db.js';
import { env } from '../../config/env.js';
import { hashRefreshToken, generateRefreshToken } from '../../utils/tokenHelper.js';
import { parseExpiration } from '../../utils/dateHelper.js';
import { getUserPermissions } from '../rbacService.js';
import {
  managerClaimsForJwt,
  tenantClaimsForJwt,
} from '../authService.js';

const IMPERSONATION_ACCESS_EXPIRES = process.env.JWT_IMPERSONATION_ACCESS_EXPIRES_IN || '2h';
const IMPERSONATION_REFRESH_EXPIRES = process.env.JWT_IMPERSONATION_REFRESH_EXPIRES_IN || '8h';
const EXCHANGE_CODE_TTL_SECONDS = 90;

function ttlFromString(expiresIn) {
  if (typeof expiresIn !== 'string') return 2 * 60 * 60;
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (!match) return 2 * 60 * 60;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60;
    case 'h':
      return value * 60 * 60;
    case 'm':
      return value * 60;
    case 's':
      return value;
    default:
      return 2 * 60 * 60;
  }
}

async function loadTargetUser(userId) {
  const [user] = await query(
    `SELECT id, tenant_id, email, name, role, role_id, is_enabled, is_platform_admin, token_version,
            manager_id,
            COALESCE(datetime_display_mode, 'ist_fixed') AS datetime_display_mode,
            COALESCE(datetime_timezone, 'Asia/Kolkata') AS datetime_timezone,
            COALESCE(datetime_date_format, 'DD-MM-YYYY') AS datetime_date_format,
            COALESCE(datetime_time_format, '12h_with_seconds') AS datetime_time_format
     FROM users
     WHERE id = ? AND is_deleted = 0`,
    [userId]
  );
  return user || null;
}

async function buildImpersonationAccessToken(user, impersonatorId) {
  const permissions = await getUserPermissions(user.id, user.role_id);
  const tenantBranding = await tenantClaimsForJwt(user.tenant_id, false);
  const managerBranding = await managerClaimsForJwt(user);

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      user_id: user.id,
      name: user.name ?? null,
      tenant_id: user.tenant_id,
      role: user.role,
      role_id: user.role_id,
      is_platform_admin: false,
      permissions,
      token_version: user.token_version ?? 1,
      session_type: 'impersonation',
      impersonator_id: impersonatorId,
      datetime_display_mode: user.datetime_display_mode ?? 'ist_fixed',
      datetime_timezone: user.datetime_timezone ?? 'Asia/Kolkata',
      datetime_date_format: user.datetime_date_format ?? 'DD-MM-YYYY',
      datetime_time_format: user.datetime_time_format ?? '12h_with_seconds',
      ...managerBranding,
      ...tenantBranding,
    },
    env.jwtSecret,
    { expiresIn: IMPERSONATION_ACCESS_EXPIRES }
  );
}

async function issueImpersonationTokens(impersonatorId, targetUser) {
  const accessToken = await buildImpersonationAccessToken(targetUser, impersonatorId);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = parseExpiration(IMPERSONATION_REFRESH_EXPIRES);

  await query(
    `INSERT INTO impersonation_sessions (impersonator_user_id, target_user_id, tenant_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [impersonatorId, targetUser.id, targetUser.tenant_id, tokenHash, expiresAt]
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ttlFromString(IMPERSONATION_ACCESS_EXPIRES),
  };
}

/**
 * Start impersonation: returns one-time exchange code (opens tenant workspace).
 */
export async function startImpersonation(impersonatorId, targetUserId) {
  const targetUser = await loadTargetUser(targetUserId);
  if (!targetUser) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (targetUser.is_platform_admin) {
    const err = new Error('Cannot impersonate platform admin users');
    err.status = 400;
    throw err;
  }
  if (!targetUser.is_enabled) {
    const err = new Error('User account is disabled');
    err.status = 403;
    throw err;
  }
  if (targetUser.tenant_id == null) {
    const err = new Error('User has no workspace');
    err.status = 400;
    throw err;
  }

  const [tenant] = await query(
    `SELECT id, name, slug, is_enabled FROM tenants WHERE id = ? AND is_deleted = 0`,
    [targetUser.tenant_id]
  );
  if (!tenant || !tenant.is_enabled) {
    const err = new Error('Workspace is disabled or not found');
    err.status = 403;
    throw err;
  }

  const tokens = await issueImpersonationTokens(impersonatorId, targetUser);
  const code = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + EXCHANGE_CODE_TTL_SECONDS * 1000);

  const payload = {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_in: tokens.expiresIn,
    tenant_slug: tenant.slug,
    tenant_name: tenant.name,
    target_user: {
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
    },
    impersonator_id: impersonatorId,
  };

  await query(
    `INSERT INTO impersonation_exchange_codes (code, payload_json, expires_at) VALUES (?, ?, ?)`,
    [code, JSON.stringify(payload), expiresAt]
  );

  return {
    exchange_code: code,
    expires_in: EXCHANGE_CODE_TTL_SECONDS,
    tenant_slug: tenant.slug,
    tenant_name: tenant.name,
    target_user: payload.target_user,
  };
}

export async function exchangeImpersonationCode(code) {
  if (!code || typeof code !== 'string') {
    const err = new Error('Code is required');
    err.status = 400;
    throw err;
  }

  const rows = await query(
    `SELECT id, payload_json, expires_at, used_at
     FROM impersonation_exchange_codes
     WHERE code = ?
     LIMIT 1`,
    [code.trim()]
  );
  const row = rows[0];
  if (!row) {
    const err = new Error('Invalid or expired link');
    err.status = 400;
    throw err;
  }
  if (row.used_at) {
    const err = new Error('This link was already used');
    err.status = 400;
    throw err;
  }
  if (new Date(row.expires_at) <= new Date()) {
    const err = new Error('This link has expired. Open the workspace again from the admin panel.');
    err.status = 400;
    throw err;
  }

  await query(`UPDATE impersonation_exchange_codes SET used_at = NOW() WHERE id = ?`, [row.id]);

  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
  return payload;
}

export async function refreshImpersonationToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  const rows = await query(
    `SELECT id, impersonator_user_id, target_user_id, tenant_id, expires_at, ended_at
     FROM impersonation_sessions
     WHERE token_hash = ?`,
    [tokenHash]
  );
  const session = rows[0];
  if (!session || session.ended_at) {
    const err = new Error('Invalid impersonation session');
    err.status = 401;
    throw err;
  }
  if (new Date(session.expires_at) <= now) {
    const err = new Error('Impersonation session expired');
    err.status = 401;
    throw err;
  }

  const [impersonator] = await query(
    `SELECT id, is_enabled, is_platform_admin FROM users WHERE id = ? AND is_deleted = 0`,
    [session.impersonator_user_id]
  );
  if (!impersonator?.is_enabled || !impersonator.is_platform_admin) {
    const err = new Error('Support session is no longer valid');
    err.status = 403;
    throw err;
  }

  const targetUser = await loadTargetUser(session.target_user_id);
  if (!targetUser?.is_enabled) {
    const err = new Error('Target user is no longer available');
    err.status = 403;
    throw err;
  }

  await query(`UPDATE impersonation_sessions SET ended_at = NOW() WHERE id = ?`, [session.id]);

  const tokens = await issueImpersonationTokens(session.impersonator_user_id, targetUser);
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  };
}

export async function endImpersonationSession(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashRefreshToken(refreshToken);
  await query(
    `UPDATE impersonation_sessions SET ended_at = NOW() WHERE token_hash = ? AND ended_at IS NULL`,
    [tokenHash]
  );
}
