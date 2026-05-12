// Tenant domain resolution helpers
// - Uses subdomains for tenant/platform separation
// - Never used for security decisions (routing & UI only)

import { getPlatformAdminHost, getTenantAppDomain } from '../config/tenantWorkspaceUrl';

const DEV_TENANT_KEY = 'dev_tenant';

function marketingHost() {
  return `www.${getTenantAppDomain()}`;
}

/** Match server domainHelper — ngrok first label is not a tenant slug */
const TUNNEL_HOST_SUFFIXES = [
  'ngrok-free.app',
  'ngrok.io',
  'ngrok.app',
  'ngrok.dev',
  'loca.lt',
  'localhost.run',
];

function getHostname() {
  if (typeof window === 'undefined') return '';
  return window.location.hostname || '';
}

function isLocalhost(hostname) {
  return hostname.includes('localhost');
}

function isTunnelHostname(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return TUNNEL_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

function getDevTenantOverride(hostname) {
  if (!hostname || typeof window === 'undefined') {
    return null;
  }
  if (!isLocalhost(hostname) && !isTunnelHostname(hostname)) {
    return null;
  }

  try {
    return window.localStorage.getItem(DEV_TENANT_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current subdomain / tenant slug.
 * - localhost → optional dev override (localStorage["dev_tenant"])
 * - admin.<apex> (see getPlatformAdminHost) → "platform"
 * - www.<apex> → null (marketing)
 * - {tenant}.<apex> → "{tenant}"
 */
export function getSubdomain() {
  const hostname = getHostname();
  if (!hostname) return null;

  const devOverride = getDevTenantOverride(hostname);
  if (devOverride) {
    return devOverride.toLowerCase();
  }

  if (isLocalhost(hostname) || isTunnelHostname(hostname)) {
    return null;
  }

  const lower = hostname.toLowerCase();
  if (lower === getPlatformAdminHost()) {
    return 'platform';
  }

  if (lower === marketingHost()) {
    return null;
  }

  const parts = hostname.split('.');
  if (parts.length <= 1) {
    return null;
  }

  return parts[0]?.toLowerCase() || null;
}

export function isPlatformAdminDomain() {
  const hostname = getHostname();
  if (!hostname) return false;

  const devOverride = getDevTenantOverride(hostname);
  if (devOverride) {
    return devOverride.toLowerCase() === 'platform';
  }

  if (isLocalhost(hostname) || isTunnelHostname(hostname)) {
    return false;
  }

  return hostname.toLowerCase() === getPlatformAdminHost();
}

export function isMarketingDomain() {
  const hostname = getHostname();
  if (!hostname) return false;

  if (isLocalhost(hostname) || isTunnelHostname(hostname)) {
    return false;
  }

  return hostname.toLowerCase() === marketingHost();
}

export function isTenantDomain() {
  if (isPlatformAdminDomain() || isMarketingDomain()) {
    return false;
  }

  const subdomain = getSubdomain();
  return Boolean(subdomain && subdomain !== 'platform');
}

export function isLocalDevelopment() {
  const hostname = getHostname();
  return isLocalhost(hostname);
}

