import { createSlice } from '@reduxjs/toolkit';
import { getSubdomain } from '../../utils/tenantResolver';
import { userAndTenantFromToken, decodeJwtPayload } from './utils/jwtUtils';

const AUTH_STORAGE_KEY = 'call_nest_auth';

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return true;
  // Add 60 second buffer
  return Date.now() >= (payload.exp * 1000) - 60000;
}

function loadPersistedAuth() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;
    
    const { accessToken, refreshToken } = JSON.parse(stored);
    if (!accessToken) return null;
    
    // If access token is expired but we have refresh token, still load (will refresh)
    // If both are expired/missing, clear storage
    const accessExpired = isTokenExpired(accessToken);
    const hasRefreshToken = !!refreshToken;
    
    if (accessExpired && !hasRefreshToken) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    
    const decoded = userAndTenantFromToken(accessToken);
    if (!decoded || !decoded.user) return null;
    
    return {
      accessToken,
      refreshToken,
      user: decoded.user,
      tenant: decoded.tenant,
      permissions: decoded.permissions || [],
      tokenVersion: decoded.tokenVersion,
    };
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function persistAuth(accessToken, refreshToken) {
  try {
    if (accessToken) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken, refreshToken }));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

const persisted = loadPersistedAuth();

const initialState = {
  user: persisted?.user || null,
  tenant: persisted?.tenant || null,
  tenantSlug: persisted?.tenant?.slug || null,
  accessToken: persisted?.accessToken || null,
  refreshToken: persisted?.refreshToken || null,
  isAuthenticated: !!persisted?.accessToken,
  loading: false,
  error: null,
  permissions: persisted?.permissions || [],
  tokenVersion: persisted?.tokenVersion || null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart(state) {
      state.loading = true;
      state.error = null;
    },
    loginSuccess(state, action) {
      const { user, tenant, accessToken, refreshToken, tenantSlug, permissions, tokenVersion } = action.payload;
      state.user = user;
      state.tenant = tenant;
      state.tenantSlug = tenantSlug ?? tenant?.slug ?? getSubdomain();
      state.accessToken = accessToken;
      state.refreshToken = refreshToken ?? state.refreshToken;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
      // RBAC fields from JWT
      state.permissions = permissions ?? [];
      state.tokenVersion = tokenVersion ?? null;
      // Persist to localStorage
      persistAuth(accessToken, refreshToken ?? state.refreshToken);
    },
    loginFailure(state, action) {
      state.loading = false;
      state.error = action.payload ?? 'Login failed';
    },
    logout(state) {
      state.user = null;
      state.tenant = null;
      state.tenantSlug = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = null;
      // Clear RBAC fields
      state.permissions = [];
      state.tokenVersion = null;
      // Clear localStorage
      persistAuth(null, null);
    },
    registerStart(state) {
      state.loading = true;
      state.error = null;
    },
    registerSuccess(state) {
      state.loading = false;
      state.error = null;
    },
    registerFailure(state, action) {
      state.loading = false;
      state.error = action.payload ?? 'Registration failed';
    },
    setTokens(state, action) {
      const { accessToken, refreshToken, permissions, tokenVersion, user, tenant } = action.payload;
      if (accessToken != null) state.accessToken = accessToken;
      if (refreshToken != null) state.refreshToken = refreshToken;
      // Update RBAC fields if provided (from token refresh)
      if (permissions != null) state.permissions = permissions;
      if (tokenVersion != null) state.tokenVersion = tokenVersion;
      if (user != null) state.user = user;
      if (tenant !== undefined) {
        state.tenant = tenant;
        state.tenantSlug = tenant?.slug ?? state.tenantSlug;
      }
      // Persist updated tokens
      persistAuth(state.accessToken, state.refreshToken);
    },
    clearError(state) {
      state.error = null;
    },
    /** After saving company name / slug from tenant settings (JWT may still refresh later). */
    workspaceCompanyUpdated(state, action) {
      const { name, slug } = action.payload;
      if (state.tenant) {
        if (name != null) state.tenant.name = name;
        if (slug != null) state.tenant.slug = slug;
      }
      if (slug != null) state.tenantSlug = slug;
    },
  },
});

export const {
  loginStart,
  loginSuccess,
  loginFailure,
  logout,
  registerStart,
  registerSuccess,
  registerFailure,
  setTokens,
  clearError,
  workspaceCompanyUpdated,
} = authSlice.actions;

export default authSlice.reducer;
