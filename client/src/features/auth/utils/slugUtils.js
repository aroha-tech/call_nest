const SLUG_REGEX = /^[a-z0-9-]+$/;

/**
 * Format string as slug: lowercase, replace spaces/special with hyphens, collapse multiple hyphens.
 */
export function slugFromCompanyName(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Validate slug; returns error string or null.
 */
export function validateSlug(slug) {
  if (!slug || !slug.trim()) return 'Slug is required';
  if (!SLUG_REGEX.test(slug)) return 'Only lowercase letters, numbers, and hyphens';
  return null;
}
