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
