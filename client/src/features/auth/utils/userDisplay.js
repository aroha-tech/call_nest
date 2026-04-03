/**
 * Display name: DB `name` when set, otherwise local part of email.
 */
export function getUserDisplayName(user) {
  if (!user) return '';
  const n = typeof user.name === 'string' ? user.name.trim() : '';
  if (n) return n;
  const email = user.email;
  if (typeof email === 'string' && email.includes('@')) {
    return email.split('@')[0];
  }
  return 'User';
}

/**
 * Up to two characters for avatar fallback (initials).
 */
export function getUserInitials(user) {
  const display = getUserDisplayName(user);
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return display.slice(0, 2).toUpperCase() || '?';
}

/** Label for reporting manager (sidebar / profile). */
export function getManagerDisplayLabel(manager) {
  if (!manager) return '';
  const n = typeof manager.name === 'string' ? manager.name.trim() : '';
  if (n) return n;
  if (manager.email) return manager.email;
  if (manager.id != null) return `Manager #${manager.id}`;
  return '';
}
