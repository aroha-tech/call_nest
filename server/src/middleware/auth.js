import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid authorization header');
    err.status = 401;
    throw err;
  }
  return header.slice(7);
}

function buildUserFromPayload(payload) {
  const userId = payload.user_id ?? payload.sub;
  const tenantId =
    payload.tenant_id !== undefined
      ? payload.tenant_id
      : payload.tenantId !== undefined
        ? payload.tenantId
        : null;

  return {
    id: userId,
    email: payload.email,
    tenantId,
    role: payload.role,
    roleId: payload.role_id ?? null,
    isPlatformAdmin: Boolean(payload.is_platform_admin),
    permissions: payload.permissions || [],
    tokenVersion: payload.token_version ?? 1,
  };
}

function attachUserFromJwt(req) {
  const token = extractToken(req);
  const payload = jwt.verify(token, env.jwtSecret);
  req.user = buildUserFromPayload(payload);
}

/**
 * Generic auth middleware (backwards compatible)
 * - Verifies JWT
 * - Attaches req.user { id, email, tenantId, role, isPlatformAdmin }
 */
export function authMiddleware(req, res, next) {
  try {
    attachUserFromJwt(req);
    return next();
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message || 'Invalid or expired token' });
  }
}

/**
 * Platform auth middleware
 * - Only for admin.<domain> (req.isPlatform = true)
 * - Requires isPlatformAdmin = true
 * - Enforces that platform admins are not bound to a tenant (tenantId must be null)
 */
export function platformAuthMiddleware(req, res, next) {
  try {
    attachUserFromJwt(req);
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message || 'Invalid or expired token' });
  }

  if (!req.isPlatform) {
    return res.status(403).json({ error: 'Platform API can only be used on admin domain' });
  }

  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admin access required' });
  }

  if (req.user.tenantId != null) {
    return res.status(403).json({ error: 'Platform admins must not have tenant_id' });
  }

  return next();
}

/**
 * Tenant auth middleware
 * - Only for {tenant}.<domain> (req.tenant is set by tenantResolver)
 * - In dev with no subdomain, req.tenant may be null; then we resolve from JWT tenant_id
 * - Tenant users MUST have tenantId
 * - Rejects cross-tenant access (req.user.tenantId must match req.tenant.id)
 * - Platform admins are not allowed to call tenant APIs
 */
export async function tenantAuthMiddleware(req, res, next) {
  try {
    attachUserFromJwt(req);
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message || 'Invalid or expired token' });
  }

  // In dev (no subdomain), tenantResolver leaves req.tenant null; resolve from user's tenant_id
  if ((!req.tenant || !req.tenant.id) && req.user?.tenantId != null) {
    try {
      const rows = await query(
        `SELECT id, name, slug, is_enabled, is_deleted
         FROM tenants WHERE id = ? AND is_deleted = 0 LIMIT 1`,
        [req.user.tenantId]
      );
      const tenant = rows?.[0];
      if (tenant) {
        if (!tenant.is_enabled) {
          return res.status(403).json({ error: 'Tenant account is disabled' });
        }
        req.tenant = { id: tenant.id, slug: tenant.slug, name: tenant.name };
      }
    } catch (err) {
      console.error('Tenant resolve from user:', err);
      return res.status(500).json({ error: 'Failed to resolve tenant' });
    }
  }

  if (!req.tenant || !req.tenant.id) {
    return res.status(400).json({ error: 'Tenant context is required' });
  }

  if (req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: 'Platform admins cannot access tenant-scoped APIs' });
  }

  if (req.user?.tenantId == null) {
    return res.status(403).json({ error: 'Tenant user must have tenant_id' });
  }

  if (Number(req.user.tenantId) !== Number(req.tenant.id)) {
    return res.status(403).json({ error: 'Cross-tenant access denied' });
  }

  return next();
}

/**
 * Verify token version matches database
 * Rejects token if user's token_version has been incremented (force re-login)
 * Call this middleware AFTER authentication middleware
 */
export async function verifyTokenVersion(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const [row] = await query('SELECT token_version FROM users WHERE id = ? AND is_deleted = 0', [req.user.id]);
    
    if (!row) {
      return res.status(401).json({ error: 'User not found' });
    }

    const dbTokenVersion = row.token_version ?? 1;
    const jwtTokenVersion = req.user.tokenVersion ?? 1;

    if (dbTokenVersion !== jwtTokenVersion) {
      return res.status(401).json({ 
        error: 'Token invalidated. Please login again.',
        code: 'TOKEN_VERSION_MISMATCH'
      });
    }

    return next();
  } catch (err) {
    console.error('Error verifying token version:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Require specific permission(s)
 * Platform admins bypass permission checks
 * @param {string|string[]} permissionCodes - Single permission code or array of codes (any match = allowed)
 */
export function requirePermission(permissionCodes) {
  const codes = Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Platform admins bypass all permission checks
    if (req.user.isPlatformAdmin) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasPermission = codes.some((code) => userPermissions.includes(code));

    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Permission denied',
        required: codes,
      });
    }

    return next();
  };
}

/**
 * Require all specified permissions (AND logic)
 * Platform admins bypass permission checks
 * @param {string[]} permissionCodes - Array of permission codes (all must match)
 */
export function requireAllPermissions(permissionCodes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Platform admins bypass all permission checks
    if (req.user.isPlatformAdmin) {
      return next();
    }

    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = permissionCodes.every((code) => userPermissions.includes(code));

    if (!hasAllPermissions) {
      return res.status(403).json({ 
        error: 'Permission denied',
        required: permissionCodes,
      });
    }

    return next();
  };
}

/**
 * Require ownership of a resource (agent-level data restriction)
 * Allows access if user owns the resource or has override permission
 * @param {function} resourceGetter - Async function (req) => { ownerId, tenantId } 
 * @param {string} [overridePermission] - Permission code that bypasses ownership check
 */
export function requireOwnership(resourceGetter, overridePermission = null) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Platform admins bypass ownership checks
    if (req.user.isPlatformAdmin) {
      return next();
    }

    // Check override permission if specified
    if (overridePermission) {
      const userPermissions = req.user.permissions || [];
      if (userPermissions.includes(overridePermission)) {
        return next();
      }
    }

    try {
      const resource = await resourceGetter(req);

      if (!resource) {
        return res.status(404).json({ error: 'Resource not found' });
      }

      // Verify tenant match
      if (resource.tenantId && Number(resource.tenantId) !== Number(req.user.tenantId)) {
        return res.status(403).json({ error: 'Cross-tenant access denied' });
      }

      // Verify ownership
      if (resource.ownerId && Number(resource.ownerId) !== Number(req.user.id)) {
        return res.status(403).json({ error: 'You do not have access to this resource' });
      }

      return next();
    } catch (err) {
      console.error('Error checking resource ownership:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Enforce tenant context for all queries
 * Attaches tenantId to req for use in service layer
 * Platform admins can optionally specify tenant via query param
 */
export function enforceTenant(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // For tenant users, enforce their tenant
  if (!req.user.isPlatformAdmin) {
    if (!req.user.tenantId) {
      return res.status(403).json({ error: 'Tenant context required' });
    }
    req.enforcedTenantId = req.user.tenantId;
    return next();
  }

  // For platform admins, allow optional tenant override via query param
  const targetTenant = req.query.tenant_id || req.body?.tenant_id;
  if (targetTenant) {
    req.enforcedTenantId = Number(targetTenant);
  } else {
    req.enforcedTenantId = null; // Platform admin can query across tenants
  }

  return next();
}

