export function selectUser(state) {
  return state.auth?.user ?? null;
}

export function selectTenant(state) {
  return state.auth?.tenant ?? null;
}

export function selectTenantSlug(state) {
  return state.auth?.tenantSlug ?? null;
}

export function selectAccessToken(state) {
  return state.auth?.accessToken ?? null;
}

export function selectRefreshToken(state) {
  return state.auth?.refreshToken ?? null;
}

export function selectIsAuthenticated(state) {
  return state.auth?.isAuthenticated ?? false;
}

export function selectAuthLoading(state) {
  return state.auth?.loading ?? false;
}

export function selectAuthError(state) {
  return state.auth?.error ?? null;
}

export function selectPermissions(state) {
  return state.auth?.permissions ?? [];
}

export function selectTokenVersion(state) {
  return state.auth?.tokenVersion ?? null;
}

export function selectIsPlatformAdmin(state) {
  return state.auth?.user?.isPlatformAdmin ?? false;
}

export function selectRoleId(state) {
  return state.auth?.user?.roleId ?? null;
}
