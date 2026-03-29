import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { env } from '../config/env.js';
import { hashRefreshToken, generateRefreshToken } from '../utils/tokenHelper.js';
import { parseExpiration } from '../utils/dateHelper.js';
import { redis, isRedisAvailable, refreshTokenKey, userSessionsKey } from '../config/redis.js';
import { getUserPermissions, createSystemRolesForTenant, getRoleByTenantAndName } from './rbacService.js';
import { cloneDefaultsForTenant } from './dispositionCloneService.js';

function ttlFromString(expiresIn) {
  if (typeof expiresIn !== 'string') {
    return 15 * 60;
  }
  const match = expiresIn.match(/^(\d+)([dhms])$/);
  if (!match) {
    return 15 * 60;
  }
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
      return 15 * 60;
  }
}

/**
 * Register a new tenant (company)
 * Can be called by super admin or self-registration
 * Also creates system roles (admin, manager, agent) for the tenant
 * industryId is required for auto-cloning default dialing sets/dispositions
 */
export async function registerTenant(name, slug, industryId = null) {
  // Validate industry_id if provided
  if (industryId) {
    const [industry] = await query('SELECT id FROM industries WHERE id = ? AND is_active = 1', [industryId]);
    if (!industry) {
      const err = new Error('Invalid industry selected');
      err.status = 400;
      throw err;
    }
  }

  // Check if slug already exists
  const existing = await query('SELECT id FROM tenants WHERE slug = ? AND is_deleted = 0', [slug]);
  if (existing.length > 0) {
    const err = new Error('Tenant slug already exists');
    err.status = 409;
    throw err;
  }
  
  const result = await query(
    'INSERT INTO tenants (name, slug, industry_id) VALUES (?, ?, ?)',
    [name, slug, industryId]
  );
  
  const [tenant] = await query('SELECT id, name, slug, industry_id, is_enabled FROM tenants WHERE id = ?', [result.insertId]);
  
  // Create system roles for the new tenant
  await createSystemRolesForTenant(tenant.id);
  
  return tenant;
}

/**
 * Register a new user (admin, manager, agent)
 * tenantId must be provided (cannot create platform super admin via registration)
 * Assigns role_id based on role name for the new RBAC system
 */
export async function registerUser(email, password, name, tenantId, role) {
  // Validate role
  if (role === 'super_admin') {
    const err = new Error('Cannot register super admin');
    err.status = 403;
    throw err;
  }
  
  // Check if email already exists for this tenant
  const existing = await query(
    'SELECT id FROM users WHERE email = ? AND tenant_id = ? AND is_deleted = 0',
    [email, tenantId]
  );
  if (existing.length > 0) {
    const err = new Error('Email already registered for this tenant');
    err.status = 409;
    throw err;
  }
  
  // Get role_id from roles table for the new RBAC system
  const roleRecord = await getRoleByTenantAndName(tenantId, role);
  const roleId = roleRecord?.id || null;
  
  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);
  
  // Insert user (tenant-scoped) with role_id for new RBAC
  // Note: query() returns a result object for INSERT (insertId), not an array — do not destructure
  const result = await query(
    'INSERT INTO users (tenant_id, email, password_hash, name, role, role_id, is_platform_admin, token_version) VALUES (?, ?, ?, ?, ?, ?, 0, 1)',
    [tenantId, email, passwordHash, name || null, role, roleId]
  );

  const [user] = await query(
    'SELECT id, tenant_id, email, name, role, role_id, is_enabled FROM users WHERE id = ?',
    [result.insertId]
  );
  
  return user;
}

/**
 * Register tenant with admin (self-registration flow)
 * Creates tenant and first admin user
 * Auto-clones default dialing sets and dispositions based on industry
 */
export async function registerTenantWithAdmin(tenantData, adminData) {
  const { name, slug, industryId } = tenantData;
  const { email, password, name: adminName } = adminData;
  
  // Validate industry is required
  if (!industryId) {
    const err = new Error('Industry selection is required');
    err.status = 400;
    throw err;
  }
  
  // Create tenant with industry
  const tenant = await registerTenant(name, slug, industryId);
  const admin = await registerUser(email, password, adminName, tenant.id, 'admin');
  
  // Auto-clone default dialing sets and dispositions for the tenant
  try {
    const cloneResult = await cloneDefaultsForTenant(tenant.id, industryId, admin.id);
    console.log(`Auto-cloned ${cloneResult.dialingSetsCloned} dialing sets and ${cloneResult.dispositionsCloned} dispositions for tenant ${tenant.id}`);
  } catch (cloneErr) {
    console.error('Failed to auto-clone defaults for tenant:', cloneErr);
    // Don't fail registration if cloning fails - tenant can manually import later
  }
  
  return { tenant, admin };
}

/**
 * Login user
 * Returns JWT token and user info
 * JWT includes permissions array and token_version for RBAC
 *
 * @param {object} [hostContext]
 * @param {object|null} [hostContext.tenantFromHost] - req.tenant when request is on a tenant subdomain
 * @param {boolean} [hostContext.isPlatformHost] - true when request is on the platform (admin) host
 */
export async function login(email, password, hostContext = {}) {
  const { tenantFromHost, isPlatformHost } = hostContext;

  // Find user by email (tenantId derived from user record)
  const [user] = await query(
    `SELECT id, tenant_id, email, password_hash, name, role, role_id, is_enabled, is_platform_admin, token_version 
     FROM users 
     WHERE email = ? AND is_deleted = 0`,
    [email]
  );
  
  if (!user) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  
  // Check if user is enabled
  if (!user.is_enabled) {
    const err = new Error('Account is disabled');
    err.status = 403;
    throw err;
  }
  
  // Verify password
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  
  const isPlatformAdmin = Boolean(user.is_platform_admin);

  // Host must match account type (subdomain / admin site)
  if (isPlatformHost && !isPlatformAdmin) {
    const [trow] = await query(
      'SELECT slug FROM tenants WHERE id = ? AND is_deleted = 0',
      [user.tenant_id]
    );
    const slug = trow?.slug;
    const err = new Error(
      slug
        ? `This account is for workspace "${slug}". Sign in using that organization's URL, not the admin site.`
        : 'This account is for a workspace. Sign in from your organization\'s URL, not the admin site.'
    );
    err.status = 403;
    err.code = 'WRONG_WORKSPACE_HOST';
    throw err;
  }

  if (tenantFromHost && !isPlatformAdmin) {
    if (user.tenant_id !== tenantFromHost.id) {
      const [otherTenant] = await query(
        'SELECT slug, name FROM tenants WHERE id = ? AND is_deleted = 0',
        [user.tenant_id]
      );
      const slug = otherTenant?.slug || 'your organization';
      const err = new Error(
        `This account belongs to a different workspace ("${slug}"). Use that workspace's sign-in URL and try again.`
      );
      err.status = 403;
      err.code = 'WRONG_WORKSPACE_HOST';
      throw err;
    }
  }

  // Check if tenant is enabled (for non-platform users)
  if (!isPlatformAdmin && user.tenant_id != null) {
    const [tenant] = await query(
      'SELECT is_enabled FROM tenants WHERE id = ? AND is_deleted = 0',
      [user.tenant_id]
    );
    
    if (!tenant || !tenant.is_enabled) {
      const err = new Error('Tenant account is disabled');
      err.status = 403;
      throw err;
    }
  }
  
  // Update last_login_at
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  
  // Get permissions for the user's role (empty for platform admins who bypass permission checks)
  const permissions = isPlatformAdmin ? [] : await getUserPermissions(user.id, user.role_id);
  
  // Generate access token (short-lived) with permissions and token_version
  const jwtTenantId = isPlatformAdmin ? null : user.tenant_id;
  const tokenVersion = user.token_version ?? 1;
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      user_id: user.id,
      tenant_id: jwtTenantId,
      role: user.role,
      role_id: user.role_id,
      is_platform_admin: isPlatformAdmin,
      permissions,
      token_version: tokenVersion,
    },
    env.jwtSecret,
    { expiresIn: env.jwtAccessExpiresIn }
  );
  
  // Generate refresh token (long-lived)
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  
  // Calculate expiration date from env variable
  const expiresAt = parseExpiration(env.jwtRefreshExpiresIn);
  const ttlSeconds = Math.max(
    1,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000)
  );
  
  // Store refresh token in database (hashed only)
  // For platform admins we still bind refresh token rows to the platform tenant (id=1)
  const tokenTenantId = isPlatformAdmin ? 1 : user.tenant_id;
  await query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, tokenTenantId, tokenHash, expiresAt]
  );
  
  // Store in Redis cache + user session index (best-effort, skip when Redis unavailable)
  if (isRedisAvailable()) {
    try {
      const rtKey = refreshTokenKey(tokenHash);
      const sessionsKey = userSessionsKey(user.tenant_id, user.id);
      const payload = JSON.stringify({ user_id: user.id, tenant_id: user.tenant_id });

      await redis
        .multi()
        .setEx(rtKey, ttlSeconds, payload)
        .sAdd(sessionsKey, tokenHash)
        .exec();
    } catch (err) {
      console.error('Redis error while storing refresh token (login):', err);
    }
  }
  
  return {
    accessToken,
    refreshToken,
    expiresIn: typeof env.jwtAccessExpiresIn === 'string'
      ? ttlFromString(env.jwtAccessExpiresIn)
      : 15 * 60,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  // 1) Check Redis first (when available)
  let userId = null;
  let tenantId = null;
  if (isRedisAvailable()) {
    try {
      const rtKey = refreshTokenKey(tokenHash);
      const cached = await redis.get(rtKey);
      if (cached) {
        const data = JSON.parse(cached);
        userId = data.user_id;
        tenantId = data.tenant_id;
      }
    } catch (err) {
      console.error('Redis error while reading refresh token (refresh):', err);
    }
  }

  // 2) DB fallback if not found in Redis
  let tokenRecord = null;
  if (!userId || !tenantId) {
    const rows = await query(
      `SELECT rt.id, rt.user_id, rt.tenant_id, rt.expires_at, rt.is_revoked, rt.is_deleted,
              u.email, u.role, u.is_enabled, u.is_platform_admin
       FROM refresh_tokens rt
       INNER JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = ?`,
      [tokenHash]
    );
    tokenRecord = rows[0];

    if (!tokenRecord || tokenRecord.is_revoked || tokenRecord.is_deleted) {
      const err = new Error('Invalid refresh token');
      err.status = 401;
      throw err;
    }

    if (new Date(tokenRecord.expires_at) <= now) {
      const err = new Error('Refresh token expired');
      err.status = 401;
      throw err;
    }

    if (!tokenRecord.is_enabled) {
      const err = new Error('User account is disabled');
      err.status = 403;
      throw err;
    }

    userId = tokenRecord.user_id;
    tenantId = tokenRecord.tenant_id;

    // Reinsert into Redis cache (when available)
    if (isRedisAvailable()) {
      try {
        const ttlSeconds = Math.max(
          1,
          Math.floor((new Date(tokenRecord.expires_at).getTime() - now.getTime()) / 1000)
        );
        const rtKey = refreshTokenKey(tokenHash);
        const sessionsKey = userSessionsKey(tenantId, userId);

        await redis
          .multi()
          .setEx(
            rtKey,
            ttlSeconds,
            JSON.stringify({ user_id: userId, tenant_id: tokenRecord.tenant_id })
          )
          .sAdd(sessionsKey, tokenHash)
          .exec();
      } catch (err) {
        console.error('Redis error while reinserting refresh token (refresh):', err);
      }
    }
  }

  // 3) Rotate token: revoke old, delete Redis key + session index
  await query(
    `UPDATE refresh_tokens
     SET is_revoked = 1, is_deleted = 1, deleted_at = NOW()
     WHERE token_hash = ? AND tenant_id = ? AND is_revoked = 0`,
    [tokenHash, tenantId]
  );

  if (isRedisAvailable()) {
    try {
      const rtKey = refreshTokenKey(tokenHash);
      const sessionsKey = userSessionsKey(tenantId, userId);
      await redis
        .multi()
        .del(rtKey)
        .sRem(sessionsKey, tokenHash)
        .exec();
    } catch (err) {
      console.error('Redis error while deleting old refresh token (refresh):', err);
    }
  }

  // 4) Load user info for new tokens
  const [user] = await query(
    `SELECT id, tenant_id, email, role, role_id, is_enabled, is_platform_admin, token_version
     FROM users
     WHERE id = ? AND is_deleted = 0`,
    [userId]
  );

  if (!user || !user.is_enabled) {
    const err = new Error('User account is disabled or deleted');
    err.status = 403;
    throw err;
  }

  const isPlatformAdmin = Boolean(user.is_platform_admin);
  
  // Get permissions for the user's role
  const permissions = isPlatformAdmin ? [] : await getUserPermissions(user.id, user.role_id);
  const tokenVersion = user.token_version ?? 1;

  // 5) Generate new access + refresh tokens with permissions and token_version
  const jwtTenantId = isPlatformAdmin ? null : user.tenant_id;
  const accessToken = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      user_id: user.id,
      tenant_id: jwtTenantId,
      role: user.role,
      role_id: user.role_id,
      is_platform_admin: isPlatformAdmin,
      permissions,
      token_version: tokenVersion,
    },
    env.jwtSecret,
    { expiresIn: env.jwtAccessExpiresIn }
  );

  const newRefreshToken = generateRefreshToken();
  const newHash = hashRefreshToken(newRefreshToken);
  const newExpiresAt = parseExpiration(env.jwtRefreshExpiresIn);
  const newTtlSeconds = Math.max(
    1,
    Math.floor((newExpiresAt.getTime() - Date.now()) / 1000)
  );

  const tokenTenantId = isPlatformAdmin ? 1 : user.tenant_id;

  await query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, expires_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, tokenTenantId, newHash, newExpiresAt]
  );

  if (isRedisAvailable()) {
    try {
      const rtKeyNew = refreshTokenKey(newHash);
      const sessionsKeyNew = userSessionsKey(user.tenant_id, user.id);

      await redis
        .multi()
        .setEx(
          rtKeyNew,
          newTtlSeconds,
          JSON.stringify({ user_id: user.id, tenant_id: user.tenant_id })
        )
        .sAdd(sessionsKeyNew, newHash)
        .exec();
    } catch (err) {
      console.error('Redis error while storing new refresh token (refresh):', err);
    }
  }

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: typeof env.jwtAccessExpiresIn === 'string'
      ? ttlFromString(env.jwtAccessExpiresIn)
      : 15 * 60,
  };
}

/**
 * Revoke refresh token (logout)
 */
export async function revokeRefreshToken(refreshToken) {
  const tokenHash = hashRefreshToken(refreshToken);

  await query(
    `UPDATE refresh_tokens
     SET is_revoked = 1, is_deleted = 1, deleted_at = NOW()
     WHERE token_hash = ? AND is_revoked = 0`,
    [tokenHash]
  );

  if (isRedisAvailable()) {
    try {
      const rtKey = refreshTokenKey(tokenHash);
      await redis.del(rtKey);
    } catch (err) {
      console.error('Redis error while revoking refresh token (logout):', err);
    }
  }
}

/**
 * Revoke all refresh tokens for a user (logout from all devices)
 */
export async function revokeAllUserTokens(tenantId, userId) {
  await query(
    `UPDATE refresh_tokens
     SET is_revoked = 1, is_deleted = 1, deleted_at = NOW()
     WHERE user_id = ? AND tenant_id = ? AND is_revoked = 0`,
    [userId, tenantId]
  );

  if (isRedisAvailable()) {
    try {
      const sessionsKey = userSessionsKey(tenantId, userId);
      const tokenHashes = await redis.sMembers(sessionsKey);

      if (tokenHashes.length > 0) {
        const keys = tokenHashes.map((hash) => refreshTokenKey(hash));
        await redis.del(keys);
      }

      await redis.del(sessionsKey);
    } catch (err) {
      console.error('Redis error while revoking all user tokens (logout all):', err);
    }
  }
}
