import { query } from '../config/db.js';
import { env, isBootstrapApiHost } from '../config/env.js';
import { getSubdomainFromHost, isTunnelHostname } from '../utils/domainHelper.js';

const PLATFORM_SUBDOMAIN = process.env.PLATFORM_SUBDOMAIN || 'admin';
const MARKETING_SUBDOMAIN = process.env.MARKETING_SUBDOMAIN || 'www';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * GET /api/public/workspace-host-status
 * Tells the SPA whether the current host’s tenant slug exists and is enabled.
 */
export async function workspaceHostStatus(req, res, next) {
  try {
    const host = req.headers.host || '';
    const [hostname] = host.split(':');
    const subdomain = getSubdomainFromHost(host);

    const usePathBasedRouting =
      isTunnelHostname(hostname) ||
      isBootstrapApiHost(host) ||
      (!subdomain && !env.isProduction);

    if (usePathBasedRouting) {
      return res.json({ skipped: true });
    }

    if (subdomain === PLATFORM_SUBDOMAIN) {
      return res.json({ skipped: true });
    }

    if (!subdomain || subdomain === MARKETING_SUBDOMAIN) {
      return res.json({ skipped: true });
    }

    const rows = await query(
      `SELECT id, name, slug, is_enabled, is_deleted
       FROM tenants
       WHERE slug = ?
       LIMIT 1`,
      [subdomain]
    );
    const tenant = rows[0];

    if (!tenant || tenant.is_deleted) {
      return res.json({
        skipped: false,
        state: 'unknown_subdomain',
        slug: subdomain,
      });
    }

    if (!tenant.is_enabled) {
      return res.json({
        skipped: false,
        state: 'disabled',
        slug: tenant.slug,
        tenantName: tenant.name,
      });
    }

    return res.json({
      skipped: false,
      state: 'ok',
      slug: tenant.slug,
      tenantName: tenant.name,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/public/workspace-lookup
 * Body: { email } — find workspace sign-in URLs for team accounts with that email.
 */
export async function workspaceLookupByEmail(req, res, next) {
  try {
    const raw = req.body?.email;
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const tenantRows = await query(
      `SELECT DISTINCT t.slug, t.name AS tenant_name
       FROM users u
       INNER JOIN tenants t ON t.id = u.tenant_id AND t.is_deleted = 0 AND t.is_enabled = 1
       WHERE LOWER(TRIM(u.email)) = ?
         AND u.is_deleted = 0
         AND u.is_platform_admin = 0
         AND u.is_enabled = 1
       ORDER BY t.name ASC`,
      [email]
    );

    const workspaces = (tenantRows || []).map((r) => ({
      slug: r.slug,
      tenantName: r.tenant_name,
    }));

    const [platformRow] = await query(
      `SELECT id FROM users
       WHERE is_platform_admin = 1 AND is_deleted = 0 AND is_enabled = 1
         AND LOWER(TRIM(email)) = ?
       LIMIT 1`,
      [email]
    );

    return res.json({
      found: workspaces.length > 0 || Boolean(platformRow),
      workspaces,
      isPlatformAdmin: Boolean(platformRow),
    });
  } catch (err) {
    next(err);
  }
}
