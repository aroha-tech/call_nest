/** Rules for public tenant / workspace slug (subdomain). Keep in sync with client slugUtils where applicable. */

export const TENANT_SLUG_MIN = 3;
export const TENANT_SLUG_MAX = 63;

/** Must be lowercase letters with single hyphens between word segments; no digits. */
export const TENANT_SLUG_FORMAT_REGEX = /^[a-z]+(?:-[a-z]+)*$/;

export const RESERVED_TENANT_SLUGS = new Set([
  'platform',
  'admin',
  'api',
  'www',
  'app',
  'localhost',
  'mail',
  'ftp',
  'cdn',
  'static',
  'assets',
  'login',
  'register',
  'auth',
  'logout',
  'dashboard',
  'billing',
  'support',
  'help',
  'status',
  'health',
  'system',
  'superadmin',
  'super-admin',
  'tenant',
  'tenants',
  'user',
  'users',
]);

/**
 * Normalize user input to a slug-like string (letters and hyphens only).
 */
export function normalizeTenantSlugInput(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Explain why raw keyboard/paste input is not acceptable (before normalization strips it).
 */
export function describeTenantSlugSourceIssue(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  if (/https?:\/\//i.test(t)) {
    return 'URLs are not allowed. Use a short name with letters and hyphens only, for example acme-corp.';
  }
  if (/www\./i.test(t)) {
    return 'Website-style addresses cannot be used. Use a short name without “www” or dots.';
  }
  if (/\.(com|net|org|io|co|in|edu|gov|app|dev)\b/i.test(t)) {
    return 'Domain-style names cannot be used as your workspace address.';
  }
  if (/[@/\\?#%&:+=]/.test(t)) {
    return 'Only letters and hyphens (-) are allowed (no special characters).';
  }
  if (/[0-9]/.test(t)) {
    return 'Numbers are not allowed in the workspace address.';
  }
  if (/[^a-zA-Z\s\-]/.test(t)) {
    return 'Only letters and hyphens (-) are allowed.';
  }
  return null;
}

/**
 * @returns {{ ok: boolean, error: string | null }}
 */
export function validateTenantSlugFormat(slug) {
  if (!slug || !String(slug).trim()) {
    return { ok: false, error: 'Workspace address is required' };
  }
  const s = String(slug).trim();
  if (s.length < TENANT_SLUG_MIN) {
    return { ok: false, error: `Use at least ${TENANT_SLUG_MIN} characters` };
  }
  if (s.length > TENANT_SLUG_MAX) {
    return { ok: false, error: `Use at most ${TENANT_SLUG_MAX} characters` };
  }
  if (!TENANT_SLUG_FORMAT_REGEX.test(s)) {
    return {
      ok: false,
      error:
        'Use only lowercase letters, with hyphens between words (for example acme-sales). No numbers or spaces.',
    };
  }
  if (s.startsWith('www')) {
    return { ok: false, error: 'Workspace address cannot start with “www”.' };
  }
  if (RESERVED_TENANT_SLUGS.has(s)) {
    return { ok: false, error: 'This address is reserved. Please choose another.' };
  }
  return { ok: true, error: null };
}
