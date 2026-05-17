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

  let manager;
  if (Object.prototype.hasOwnProperty.call(payload, 'manager_id')) {
    if (payload.manager_id != null && payload.manager_id !== '') {
      manager = {
        id: Number(payload.manager_id),
        name: payload.manager_name ?? null,
        email: payload.manager_email ?? null,
      };
    } else {
      manager = null;
    }
  } else {
    manager = undefined;
  }

  const user = {
    id: payload.user_id ?? payload.sub,
    email: payload.email,
    name: payload.name ?? null,
    profilePhotoUrl: payload.profile_photo_url ?? null,
    role: payload.role,
    roleId: payload.role_id ?? null,
    isPlatformAdmin: Boolean(payload.is_platform_admin) && payload.session_type !== 'impersonation',
    isImpersonation: payload.session_type === 'impersonation',
    datetimeDisplayMode:
      payload.datetime_display_mode === 'browser_local' ? 'browser_local' : 'ist_fixed',
    datetimeTimezone:
      typeof payload.datetime_timezone === 'string' && payload.datetime_timezone.trim()
        ? payload.datetime_timezone.trim()
        : 'Asia/Kolkata',
    datetimeDateFormat:
      typeof payload.datetime_date_format === 'string' && payload.datetime_date_format.trim()
        ? payload.datetime_date_format.trim()
        : 'DD-MM-YYYY',
    datetimeTimeFormat:
      typeof payload.datetime_time_format === 'string' && payload.datetime_time_format.trim()
        ? payload.datetime_time_format.trim()
        : '12h_with_seconds',
    manager,
  };

  let theme = null;
  if (
    payload.tenant_theme != null &&
    typeof payload.tenant_theme === 'object' &&
    !Array.isArray(payload.tenant_theme)
  ) {
    theme = payload.tenant_theme;
  }

  const tenant =
    payload.tenant_id != null
      ? {
          id: payload.tenant_id,
          name: payload.tenant_name ?? null,
          slug: payload.tenant_slug ?? null,
          theme,
          reportsAdvancedEnabled: Boolean(payload.reports_advanced_enabled),
        }
      : null;
  const permissions = Array.isArray(payload.permissions) ? payload.permissions : [];
  const tokenVersion = payload.token_version ?? null;

  return { user, tenant, permissions, tokenVersion };
}
