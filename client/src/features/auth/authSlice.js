import { createSlice } from '@reduxjs/toolkit';
import { getSubdomain } from '../../utils/tenantResolver';
import { userAndTenantFromToken, decodeJwtPayload } from './utils/jwtUtils';

import { AUTH_STORAGE_KEY } from './authConstants';
import { clearSessionSupersededPending } from './sessionEnded';
import {
  clearImpersonationStorage,
  isImpersonationStorageActive,
  loadImpersonationStorage,
  saveImpersonationStorage,
} from './impersonationStorage';

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

function loadInitialAuth() {
  if (isImpersonationStorageActive()) {
    const imp = loadImpersonationStorage();
    if (imp?.accessToken) {
      const decoded = userAndTenantFromToken(imp.accessToken);
      if (decoded?.user) {
        return {
          accessToken: imp.accessToken,
          refreshToken: imp.refreshToken,
          impersonatorId: imp.impersonatorId,
          isImpersonation: true,
          ...decoded,
          user: { ...decoded.user, isImpersonation: true },
        };
      }
    }
  }
  const persisted = loadPersistedAuth();
  if (!persisted) return null;
  return { ...persisted, isImpersonation: false, impersonatorId: null };
}

const boot = loadInitialAuth();

const initialState = {
  user: boot?.user || null,
  tenant: boot?.tenant || null,
  tenantSlug: boot?.tenant?.slug || null,
  accessToken: boot?.accessToken || null,
  refreshToken: boot?.refreshToken || null,
  isAuthenticated: !!boot?.accessToken,
  isImpersonation: Boolean(boot?.isImpersonation),
  impersonatorId: boot?.impersonatorId ?? null,
  loading: false,
  error: null,
  permissions: boot?.permissions || [],
  tokenVersion: boot?.tokenVersion || null,
};

function persistSession(state) {
  if (state.isImpersonation) {
    saveImpersonationStorage({
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      impersonatorId: state.impersonatorId,
    });
  } else {
    persistAuth(state.accessToken, state.refreshToken);
  }
}

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
      state.isImpersonation = false;
      state.impersonatorId = null;
      clearImpersonationStorage();
      persistAuth(accessToken, refreshToken ?? state.refreshToken);
      clearSessionSupersededPending();
    },
    impersonationSessionStart(state, action) {
      const { user, tenant, accessToken, refreshToken, permissions, tokenVersion, impersonatorId } =
        action.payload;
      state.user = user;
      state.tenant = tenant;
      state.tenantSlug = tenant?.slug ?? getSubdomain();
      state.accessToken = accessToken;
      state.refreshToken = refreshToken ?? null;
      state.isAuthenticated = true;
      state.isImpersonation = true;
      state.impersonatorId = impersonatorId ?? null;
      state.loading = false;
      state.error = null;
      state.permissions = permissions ?? [];
      state.tokenVersion = tokenVersion ?? null;
      persistSession(state);
      clearSessionSupersededPending();
    },
    loginFailure(state, action) {
      state.loading = false;
      state.error = action.payload ?? 'Login failed';
    },
    loginCancelled(state) {
      state.loading = false;
      state.error = null;
    },
    logout(state) {
      const wasImpersonation = state.isImpersonation;
      state.user = null;
      state.tenant = null;
      state.tenantSlug = null;
      state.accessToken = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.isImpersonation = false;
      state.impersonatorId = null;
      state.loading = false;
      state.error = null;
      state.permissions = [];
      state.tokenVersion = null;
      if (wasImpersonation) {
        clearImpersonationStorage();
      } else {
        persistAuth(null, null);
      }
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
      persistSession(state);
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
  loginCancelled,
  logout,
  registerStart,
  registerSuccess,
  registerFailure,
  setTokens,
  clearError,
  workspaceCompanyUpdated,
  impersonationSessionStart,
} = authSlice.actions;

export default authSlice.reducer;
