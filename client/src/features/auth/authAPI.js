import { axiosInstance } from '../../services/axiosInstance';

const AUTH_BASE = '/api/auth';

/**
 * Login with email and password.
 * Returns { access_token, refresh_token, expires_in }.
 */
export async function login(email, password) {
  const { data } = await axiosInstance.post(`${AUTH_BASE}/login`, { email, password });
  return data;
}

/**
 * Get industries for registration dropdown (public).
 */
export async function getIndustries() {
  const { data } = await axiosInstance.get(`${AUTH_BASE}/industries`);
  return data.data || [];
}

/**
 * Check slug format + database availability (public).
 * Returns { valid, available, normalized, error, suggestions }.
 * @param {string} slug
 * @param {{ excludeTenantId?: number|string }} [options] - when editing, exclude this tenant so its current slug stays "available"
 */
export async function getTenantSlugStatus(slug, options = {}) {
  const params = { slug: slug ?? '' };
  if (options.excludeTenantId != null && options.excludeTenantId !== '') {
    params.excludeTenantId = options.excludeTenantId;
  }
  const { data } = await axiosInstance.get(`${AUTH_BASE}/tenant-slug-status`, { params });
  return data;
}

/**
 * Register new tenant with admin user.
 * Body: { tenantName, tenantSlug, industryId, email, password, name } (name = admin name).
 */
export async function registerTenant(payload) {
  const { data } = await axiosInstance.post(`${AUTH_BASE}/register`, payload);
  return data;
}

/**
 * Refresh access token. Uses refresh token from store (memory) or cookie.
 */
export async function refreshToken(refreshTokenValue) {
  const body = refreshTokenValue ? { refreshToken: refreshTokenValue } : {};
  const { data } = await axiosInstance.post(`${AUTH_BASE}/refresh`, body);
  return data;
}

/**
 * Logout and revoke refresh token.
 */
export async function logoutAPI(refreshTokenValue) {
  await axiosInstance.post(`${AUTH_BASE}/logout`, { refreshToken: refreshTokenValue });
}

/**
 * Update current user's profile (name, password). Email is not editable via this API.
 * Returns new access_token.
 */
export async function updateProfile(payload) {
  const { data } = await axiosInstance.patch(`${AUTH_BASE}/me`, payload);
  return data;
}

/**
 * Get signed-in user's server-side flags (including per-agent delete flags).
 */
export async function getMe() {
  const { data } = await axiosInstance.get(`${AUTH_BASE}/me`);
  return data;
}
