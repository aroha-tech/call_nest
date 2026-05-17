import { impersonationAdminAPI } from '../features/auth/impersonationAPI';
import { getTenantWorkspaceUrl } from '../config/tenantWorkspaceUrl';

/**
 * Super admin: open tenant workspace in a new tab as the given user.
 */
export async function openWorkspaceAsUser(userId) {
  const { data } = await impersonationAdminAPI.start(userId);
  const slug = data?.tenant_slug;
  const code = data?.exchange_code;
  if (!slug || !code) {
    throw new Error('Could not start support session');
  }
  const base = getTenantWorkspaceUrl(slug);
  const url = `${base}/auth/impersonate?code=${encodeURIComponent(code)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
