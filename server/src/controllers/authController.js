import * as authService from '../services/authService.js';
import { query } from '../config/db.js';
import { syncContactsManagerForAgent } from '../services/tenant/contactsService.js';
import {
  normalizeTenantSlugInput,
  describeTenantSlugSourceIssue,
  validateTenantSlugFormat,
} from '../utils/tenantSlugRules.js';

/**
 * Register a new tenant (company) with admin
 * POST /api/auth/register
 * Body: { tenantName, tenantSlug, industryId, email, password, name }
 */
export async function register(req, res, next) {
  try {
    const { tenantName, tenantSlug, industryId, email, password, name } = req.body;
    
    // Validation
    if (!tenantName || !tenantSlug || !email || !password || !industryId) {
      return res.status(400).json({ 
        error: 'tenantName, tenantSlug, industryId, email, and password are required' 
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate password strength (min 8 chars)
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const slugCheck = validateTenantSlugFormat(String(tenantSlug).trim());
    if (!slugCheck.ok) {
      return res.status(400).json({ error: slugCheck.error });
    }
    
    const result = await authService.registerTenantWithAdmin(
      { name: tenantName, slug: String(tenantSlug).trim(), industryId },
      { email, password, name }
    );
    
    res.status(201).json({
      message: 'Tenant and admin registered successfully',
      tenant: result.tenant,
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        name: result.admin.name,
        role: result.admin.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Public: validate tenant slug and check availability (registration / admin create).
 * GET /api/auth/tenant-slug-status?slug=...&excludeTenantId=... (excludeTenantId optional, for edit)
 */
export async function tenantSlugStatus(req, res, next) {
  try {
    const raw = req.query.slug != null ? String(req.query.slug) : '';
    let excludeTenantId = null;
    if (req.query.excludeTenantId != null && String(req.query.excludeTenantId).trim() !== '') {
      const n = parseInt(String(req.query.excludeTenantId), 10);
      if (!Number.isNaN(n) && n > 0) excludeTenantId = n;
    }
    const sourceIssue = describeTenantSlugSourceIssue(raw);
    if (sourceIssue) {
      return res.json({
        valid: false,
        available: false,
        normalized: normalizeTenantSlugInput(raw),
        error: sourceIssue,
        suggestions: [],
      });
    }
    const normalized = normalizeTenantSlugInput(raw);
    const result = await authService.getTenantSlugStatus(normalized, excludeTenantId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Login user
 * POST /api/auth/login
 * Body: { email, password }
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const { accessToken, refreshToken, expiresIn } = await authService.login(
      email,
      password,
      {
        tenantFromHost: req.tenant,
        isPlatformHost: Boolean(req.isPlatform),
      }
    );
    
    res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Register a new agent (by admin)
 * POST /api/auth/register-agent
 * Requires: authMiddleware + tenantGuard
 * Body: { email, password, name }
 */
export async function registerAgent(req, res, next) {
  try {
    const { email, password, name, manager_id } = req.body;
    const tenantId = req.tenant?.id;
    const userRole = req.user.role;
    
    // Only admin can create agents
    if (userRole !== 'admin') {
      return res.status(403).json({ error: 'Only admin can create agents' });
    }
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    const agent = await authService.registerUser(email, password, name, tenantId, 'agent');

    // Persist agent->manager relationship only if provided
    if (manager_id !== undefined) {
      const mid = manager_id ?? null;
      await query(
        `UPDATE users
         SET manager_id = ?
         WHERE id = ? AND tenant_id = ? AND role = 'agent' AND is_deleted = 0`,
        [mid, agent.id, tenantId]
      );
      await syncContactsManagerForAgent(tenantId, agent.id, mid, req.user?.id ?? null);
    }
    
    res.status(201).json({
      message: 'Agent registered successfully',
      agent: {
        id: agent.id,
        email: agent.email,
        name: agent.name,
        role: agent.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/me
 * Update signed-in user's name and/or password. Email cannot be changed here.
 * Returns new access_token.
 */
export async function updateMe(req, res, next) {
  try {
    const { name, currentPassword, newPassword, datetimeDisplayMode, datetime_display_mode } =
      req.body;
    const result = await authService.updateProfile(req.user.id, {
      name,
      currentPassword,
      newPassword,
      datetimeDisplayMode,
      datetime_display_mode,
    });
    res.json({
      access_token: result.accessToken,
      expires_in: result.expiresIn,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Refresh access token
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
export async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }
    
    const { accessToken, refreshToken: newRefreshToken, expiresIn } =
      await authService.refreshAccessToken(refreshToken);
    
    res.json({
      access_token: accessToken,
      refresh_token: newRefreshToken,
      expires_in: expiresIn,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Logout (revoke refresh token)
 * POST /api/auth/logout
 * Body: { refreshToken }
 */
export async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      // Revoke specific refresh token
      await authService.revokeRefreshToken(refreshToken);
    } else if (req.user && req.user.tenantId) {
      // Revoke all tokens for this user (logout from all devices)
      await authService.revokeAllUserTokens(req.user.tenantId, req.user.id);
    } else {
      return res.status(400).json({ error: 'Refresh token or authentication required' });
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}
