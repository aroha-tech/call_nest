import { useMemo } from 'react';
import { useAppSelector } from '../app/hooks';
import { selectUser, selectPermissions } from '../features/auth/authSelectors';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '../utils/permissionUtils';

/**
 * Hook to check if current user has a specific permission.
 * Platform admins automatically have all permissions.
 * @param {string} permission - Permission code (e.g., "leads.read")
 * @returns {boolean}
 */
export function usePermission(permission) {
  const user = useAppSelector(selectUser);
  const permissions = useAppSelector(selectPermissions);

  return useMemo(
    () => hasPermission(user, permission, permissions),
    [user, permission, permissions]
  );
}

/**
 * Hook to check if current user has ANY of the specified permissions.
 * @param {string[]} permissionCodes - Array of permission codes
 * @returns {boolean}
 */
export function useAnyPermission(permissionCodes) {
  const user = useAppSelector(selectUser);
  const permissions = useAppSelector(selectPermissions);

  return useMemo(
    () => hasAnyPermission(user, permissionCodes, permissions),
    [user, permissionCodes, permissions]
  );
}

/**
 * Hook to check if current user has ALL of the specified permissions.
 * @param {string[]} permissionCodes - Array of permission codes
 * @returns {boolean}
 */
export function useAllPermissions(permissionCodes) {
  const user = useAppSelector(selectUser);
  const permissions = useAppSelector(selectPermissions);

  return useMemo(
    () => hasAllPermissions(user, permissionCodes, permissions),
    [user, permissionCodes, permissions]
  );
}

/**
 * Hook that returns permission check functions bound to current user.
 * Useful when you need to check multiple permissions dynamically.
 * @returns {{ can: (permission) => boolean, canAny: (permissions) => boolean, canAll: (permissions) => boolean, isPlatformAdmin: boolean }}
 */
export function usePermissions() {
  const user = useAppSelector(selectUser);
  const permissions = useAppSelector(selectPermissions);

  return useMemo(() => ({
    can: (permission) => hasPermission(user, permission, permissions),
    canAny: (codes) => hasAnyPermission(user, codes, permissions),
    canAll: (codes) => hasAllPermissions(user, codes, permissions),
    isPlatformAdmin: user?.isPlatformAdmin ?? false,
    permissions,
  }), [user, permissions]);
}
