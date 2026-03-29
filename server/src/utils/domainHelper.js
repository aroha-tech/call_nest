/** Public tunnel domains: first label is a random id, not a tenant slug */
const TUNNEL_HOST_SUFFIXES = [
  'ngrok-free.app',
  'ngrok.io',
  'ngrok.app',
  'ngrok.dev',
  'loca.lt',
  'localhost.run',
];

/**
 * True if hostname is a dev tunnel (ngrok, etc.) — do not treat *.ngrok as tenant slug.
 */
export function isTunnelHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }
  const h = hostname.toLowerCase().trim();
  return TUNNEL_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

/**
 * Extract subdomain from a Host header value.
 * Examples:
 * - admin.arohva.com      -> admin
 * - tenant1.arohva.com    -> tenant1
 * - www.arohva.com        -> www
 * - localhost:4000        -> null
 * - 127.0.0.1:4000        -> null
 * - xxx.ngrok-free.app    -> null (tunnel, not tenant slug)
 * - 143.110.254.35:4000   -> null (IPv4 — use API_BOOTSTRAP_HOSTS for path-based routing)
 */
function isIpv4(hostname) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export function getSubdomainFromHost(host) {
  if (!host || typeof host !== 'string') {
    return null;
  }

  const [hostname] = host.split(':'); // strip port
  if (!hostname) {
    return null;
  }

  const lowerHost = hostname.toLowerCase();

  // Local/dev hosts should not be treated as subdomain-based
  if (
    lowerHost === 'localhost' ||
    lowerHost === '127.0.0.1' ||
    lowerHost === '::1' ||
    lowerHost.includes(':') ||
    isIpv4(lowerHost)
  ) {
    return null;
  }

  if (isTunnelHostname(lowerHost)) {
    return null;
  }

  const parts = lowerHost.split('.');

  // Not enough segments to have a real subdomain (e.g. arohva.com)
  if (parts.length < 3) {
    return null;
  }

  return parts[0] || null;
}
