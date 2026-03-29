import { query } from '../config/db.js';
<<<<<<< Updated upstream
import { env } from '../config/env.js';
import { getSubdomainFromHost, isTunnelHostname } from '../utils/domainHelper.js';
=======
import { env, isBootstrapApiHost } from '../config/env.js';
import { getSubdomainFromHost } from '../utils/domainHelper.js';
>>>>>>> Stashed changes

const PLATFORM_SUBDOMAIN = process.env.PLATFORM_SUBDOMAIN || 'admin';
const MARKETING_SUBDOMAIN = process.env.MARKETING_SUBDOMAIN || 'www';

/**
 * Tenant resolver middleware
 *
 * - Derives subdomain from Host header
 * - admin.<domain>  -> platform context (req.isPlatform = true)
 * - {tenant}.<domain> -> loads tenant by slug and attaches to req.tenant
 * - www.<domain> or unknown tenant -> 404 Tenant Not Found
 *
 * In non-production environments, if no subdomain is present (e.g. localhost),
 * or when Host is a dev tunnel (ngrok), we use URL path + JWT tenant (same as dev):
 * - /api/admin/* routes -> platform context
 * - /api/tenant/* -> tenant from authenticated user's tenant_id
 */
export async function tenantResolver(req, res, next) {
  req.isPlatform = false;
  req.tenant = null;

  const host = req.headers.host || '';
  const [hostname] = host.split(':');
  const subdomain = getSubdomainFromHost(host);

<<<<<<< Updated upstream
  const onTunnel = isTunnelHostname(hostname);
  const useDevStyleResolution =
    onTunnel || (!subdomain && env.nodeEnv !== 'production');

  // Dev / ngrok: no real tenant slug in Host — resolve tenant from JWT on /api/tenant/*
  if (useDevStyleResolution) {
=======
  // Path-based routing: dev (no subdomain), or any host listed in API_BOOTSTRAP_HOSTS
  // (apex domain, IP, or e.g. www when listed — avoids "marketing" 404 for www on bootstrap).
  const usePathBasedRouting =
    isBootstrapApiHost(host) ||
    (!subdomain && !env.isProduction);

  if (usePathBasedRouting) {
>>>>>>> Stashed changes
    // Platform admin APIs in development
    if (req.path.startsWith('/api/admin/')) {
      req.isPlatform = true;
      return next();
    }

    // Tenant APIs in development: leave req.tenant null; tenantAuthMiddleware
    // will resolve it from the authenticated user's tenant_id so the correct
    // tenant is used for newly created tenants (not just the first one in DB).
    if (req.path.startsWith('/api/tenant/')) {
      return next();
    }

    return next();
  }

  // Platform (super admin) domain
  if (subdomain === PLATFORM_SUBDOMAIN) {
    req.isPlatform = true;
    return next();
  }

  // Marketing / non-tenant domain should not hit the API
  if (!subdomain || subdomain === MARKETING_SUBDOMAIN) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  try {
    const rows = await query(
      `SELECT id, name, slug, is_enabled, is_deleted
       FROM tenants
       WHERE slug = ?
       LIMIT 1`,
      [subdomain]
    );

    const tenant = rows[0];

    if (!tenant || tenant.is_deleted || !tenant.is_enabled) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    req.tenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

