import { env } from '../../config/env.js';

/**
 * Allow browser origin for OAuth success/error redirects (open-redirect safe).
 * Matches FRONTEND_URL host, CORS suffix (e.g. *.arohva.com), bootstrap hosts, or localhost in dev.
 * Both http and https are allowed when the hostname matches (OAuth return must match the page the user started from).
 */
export function isAllowedReturnOrigin(origin) {
  if (!origin || typeof origin !== 'string') return false;
  let u;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return false;

  const host = u.hostname.toLowerCase();
  // Allow http or https for allowlisted hosts (tenant may use http behind a proxy, or before TLS is fixed).
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  try {
    const fe = new URL(env.frontendUrl);
    if (host === fe.hostname.toLowerCase()) return true;
  } catch {
    /* ignore */
  }

  const rawSuffix = (env.corsOriginSuffix || '').trim().toLowerCase();
  if (rawSuffix) {
    const base = rawSuffix.startsWith('.') ? rawSuffix.slice(1) : rawSuffix;
    if (host === base) return true;
    if (host.endsWith(`.${base}`)) return true;
  }

  if (env.bootstrapHosts.length && env.bootstrapHosts.includes(host)) return true;

  if (!env.isProduction && (host === 'localhost' || host === '127.0.0.1')) return true;

  return false;
}

export function normalizeReturnOrigin(origin) {
  if (!origin || !isAllowedReturnOrigin(origin)) return null;
  return origin.replace(/\/$/, '');
}
