import { env } from '../config/env.js';

/**
 * Extract subdomain from a Host header value.
 * Examples:
 * - admin.arohva.com      -> admin
 * - tenant1.arohva.com    -> tenant1
 * - www.arohva.com        -> www
 * - localhost:4000        -> null
 * - 127.0.0.1:4000        -> null
 */
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
    lowerHost === '::1'
  ) {
    return null;
  }

  const parts = lowerHost.split('.');

  // Not enough segments to have a real subdomain (e.g. arohva.com)
  if (parts.length < 3) {
    return null;
  }

  return parts[0] || null;
}

