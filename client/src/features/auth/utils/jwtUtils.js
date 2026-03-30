/**
 * Decode JWT payload without verification (server validates).
 * Used only to read user/tenant for UI state.
 */
export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Build user, tenant, and RBAC data from access token payload for Redux.
 * Extracts: user info, tenant, permissions array, and token_version.
 */
export function userAndTenantFromToken(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) {
    return { user: null, tenant: null, permissions: [], tokenVersion: null };
  }

  const user = {
    id: payload.user_id ?? payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    profilePhotoUrl: payload.profile_photo_url ?? null,
    role: payload.role,
    roleId: payload.role_id ?? null,
    isPlatformAdmin: Boolean(payload.is_platform_admin),
  };

  const tenant =
    payload.tenant_id != null
      ? {
          id: payload.tenant_id,
          name: payload.tenant_name ?? null,
          slug: payload.tenant_slug ?? null,
        }
      : null;
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  const tokenVersion = payload.token_version ?? null;

  return { user, tenant, permissions, tokenVersion };
}
