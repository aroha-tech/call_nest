/**
 * Tenant CRM sign-in URLs use {slug}.<domain> (e.g. vbinfo.arohva.com).
 * Set VITE_TENANT_APP_DOMAIN in env to your apex hostname only (no https://, no subdomain).
 */

const DEFAULT_DOMAIN = 'arohva.com';

function deriveDomainFromHostname(hostname) {
  if (!hostname) return null;
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return null;
  const parts = lower.split('.');
  if (parts.length >= 3 && parts[0] === 'admin') {
    return parts.slice(1).join('.');
  }
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }
  return null;
}

export function getTenantAppDomain() {
  const fromEnv = import.meta.env.VITE_TENANT_APP_DOMAIN;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).trim().replace(/^\.+/, '').toLowerCase();
  }
  if (typeof window !== 'undefined') {
    const derived = deriveDomainFromHostname(window.location.hostname);
    if (derived) return derived;
  }
  return DEFAULT_DOMAIN;
}

/** e.g. vbinfo.arohva.com */
export function getTenantWorkspaceHost(slug) {
  if (!slug || typeof slug !== 'string') return '';
  const clean = slug.trim().toLowerCase();
  if (!clean) return '';
  return `${clean}.${getTenantAppDomain()}`;
}

function currentOriginProtocol() {
  if (typeof window !== 'undefined' && window.location?.protocol) {
    return window.location.protocol;
  }
  return 'https:';
}

/** e.g. https://vbinfo.arohva.com */
export function getTenantWorkspaceUrl(slug) {
  const host = getTenantWorkspaceHost(slug);
  if (!host) return '';
  return `${currentOriginProtocol()}//${host}`;
}

/** Super admin console host */
export function getPlatformAdminHost() {
  return `admin.${getTenantAppDomain()}`;
}

export function getPlatformAdminUrl() {
  return `${currentOriginProtocol()}//${getPlatformAdminHost()}`;
}
