/**
 * Permission utility functions for RBAC authorization.
 * Centralized permission checks — use these everywhere instead of inline checks.
 */

/**
 * Check if user has a specific permission.
 * Platform admins automatically have all permissions.
 * @param {Object} user - User object from Redux state
 * @param {string} permission - Permission code (e.g., "leads.read")
 * @param {string[]} permissions - Permissions array from Redux state
 * @returns {boolean}
 */
export function hasPermission(user, permission, permissions = []) {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  const perms = permissions ?? user.permissions ?? [];
  return perms.includes(permission);
}

/**
 * Check if user has ANY of the specified permissions.
 * Platform admins automatically pass.
 * @param {Object} user - User object from Redux state
 * @param {string[]} permissionCodes - Array of permission codes
 * @param {string[]} permissions - Permissions array from Redux state
 * @returns {boolean}
 */
export function hasAnyPermission(user, permissionCodes, permissions = []) {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  const perms = permissions ?? user.permissions ?? [];
  return permissionCodes.some((code) => perms.includes(code));
}

/**
 * Check if user has ALL of the specified permissions.
 * Platform admins automatically pass.
 * @param {Object} user - User object from Redux state
 * @param {string[]} permissionCodes - Array of permission codes
 * @param {string[]} permissions - Permissions array from Redux state
 * @returns {boolean}
 */
export function hasAllPermissions(user, permissionCodes, permissions = []) {
  if (!user) return false;
  if (user.isPlatformAdmin) return true;
  const perms = permissions ?? user.permissions ?? [];
  return permissionCodes.every((code) => perms.includes(code));
}

/**
 * Permission codes used throughout the application.
 * Import this to avoid typos and enable autocomplete.
 */
export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Contacts
  CONTACTS_READ: 'contacts.read',
  CONTACTS_CREATE: 'contacts.create',
  CONTACTS_UPDATE: 'contacts.update',
  CONTACTS_DELETE: 'contacts.delete',

  // Leads
  LEADS_READ: 'leads.read',
  LEADS_CREATE: 'leads.create',
  LEADS_UPDATE: 'leads.update',
  LEADS_DELETE: 'leads.delete',

  // Dialing
  DIAL_EXECUTE: 'dial.execute',
  DIAL_MONITOR: 'dial.monitor',

  // Reports
  REPORTS_VIEW: 'reports.view',

  // User management
  USERS_MANAGE: 'users.manage',
  /** Managers: list team + pool agents, assign/unassign to own team */
  USERS_TEAM: 'users.team',

  // Pipelines
  PIPELINES_MANAGE: 'pipelines.manage',

  // Settings
  SETTINGS_MANAGE: 'settings.manage',

  // Dispositions
  DISPOSITIONS_MANAGE: 'dispositions.manage',
  /** View dispositions & dialing sets (read-only); agents */
  WORKFLOW_VIEW: 'workflow.view',

  // Dialing Sets
  DIALING_SETS_MANAGE: 'dialing_sets.manage',

  // Templates & Resources
  TEMPLATES_MANAGE: 'templates.manage',
  SCRIPTS_MANAGE: 'scripts.manage',
  /** Create scripts; edit/delete only own (server-enforced) */
  SCRIPTS_SELF: 'scripts.self',

  // Telephony
  TELEPHONY_MANAGE: 'telephony.manage',

  // Masters (Super Admin)
  MASTERS_MANAGE: 'masters.manage',
};
