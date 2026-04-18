const HEX6 = /^#[0-9A-Fa-f]{6}$/;
const ALLOWED_FONTS = new Set(['inter', 'system']);

/**
 * Default accent for new tenants (stored in `tenants.theme_json`, embedded in JWT as `tenant_theme.primary`).
 * Client `applyWorkspaceTheme` builds the full primary scale from this hex.
 */
export const DEFAULT_TENANT_THEME_PRIMARY = '#3ab0e8';

export function defaultTenantThemeJsonString() {
  return JSON.stringify({ primary: DEFAULT_TENANT_THEME_PRIMARY });
}

export function parseThemeFromDb(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw);
      return typeof o === 'object' && o && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return null;
}

export function sanitizeHttpsUrl(u) {
  if (u == null || String(u).trim() === '') return null;
  const t = String(u).trim();
  if (t.length > 2048) return null;
  try {
    const p = new URL(t);
    if (p.protocol !== 'https:') return null;
    return t;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} input - from API body; undefined means "do not change column"
 * @returns {null|undefined|object} null = clear theme; undefined = skip update; object = stored JSON
 */
export function sanitizeThemePayload(input) {
  if (input === undefined) return undefined;
  if (input === null) return null;
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    const err = new Error('theme must be a JSON object or null');
    err.status = 400;
    throw err;
  }

  const out = {};

  if (input.primary != null && String(input.primary).trim() !== '') {
    const h = String(input.primary).trim();
    if (!HEX6.test(h)) {
      const err = new Error('theme.primary must be a #RRGGBB color');
      err.status = 400;
      throw err;
    }
    out.primary = h.toLowerCase();
  }

  if (input.logoUrl != null && String(input.logoUrl).trim() !== '') {
    const logo = sanitizeHttpsUrl(input.logoUrl);
    if (!logo) {
      const err = new Error('theme.logoUrl must be a valid https URL');
      err.status = 400;
      throw err;
    }
    out.logoUrl = logo;
  }

  if (input.workspaceTitle != null && String(input.workspaceTitle).trim() !== '') {
    const w = String(input.workspaceTitle).trim().slice(0, 120);
    if (w) out.workspaceTitle = w;
  }

  if (input.gradientStart != null && String(input.gradientStart).trim() !== '') {
    const g = String(input.gradientStart).trim();
    if (HEX6.test(g)) out.gradientStart = g.toLowerCase();
    else {
      const err = new Error('theme.gradientStart must be #RRGGBB');
      err.status = 400;
      throw err;
    }
  }

  if (input.gradientEnd != null && String(input.gradientEnd).trim() !== '') {
    const g = String(input.gradientEnd).trim();
    if (HEX6.test(g)) out.gradientEnd = g.toLowerCase();
    else {
      const err = new Error('theme.gradientEnd must be #RRGGBB');
      err.status = 400;
      throw err;
    }
  }

  if (input.fontPreset != null && String(input.fontPreset).trim() !== '') {
    const f = String(input.fontPreset).trim().toLowerCase();
    if (!ALLOWED_FONTS.has(f)) {
      const err = new Error('theme.fontPreset must be "inter" or "system"');
      err.status = 400;
      throw err;
    }
    out.fontPreset = f;
  }

  if (input.radiusPx !== undefined && input.radiusPx !== null && String(input.radiusPx).trim() !== '') {
    const n = parseInt(String(input.radiusPx), 10);
    if (Number.isNaN(n) || n < 4 || n > 24) {
      const err = new Error('theme.radiusPx must be between 4 and 24');
      err.status = 400;
      throw err;
    }
    out.radiusPx = n;
  }

  if (Object.keys(out).length === 0) return null;
  return out;
}

/** Compact branding claims embedded in JWT (tenant users only). */
export function themeForJwt(themeJson) {
  const t = parseThemeFromDb(themeJson);
  if (!t) return undefined;
  const claim = {};
  if (t.primary) claim.primary = t.primary;
  if (t.logoUrl) claim.logoUrl = t.logoUrl;
  if (t.workspaceTitle) claim.workspaceTitle = t.workspaceTitle;
  if (t.radiusPx != null) claim.radiusPx = t.radiusPx;
  if (t.fontPreset) claim.fontPreset = t.fontPreset;
  if (t.gradientStart) claim.gradientStart = t.gradientStart;
  if (t.gradientEnd) claim.gradientEnd = t.gradientEnd;
  return Object.keys(claim).length ? claim : undefined;
}
