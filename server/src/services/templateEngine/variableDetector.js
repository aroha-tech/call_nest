/**
 * Extract variable keys from text containing {{variable_key}} or {{variable_key | fallback}}
 * Used to detect which variables are referenced in a template/script.
 */

const VARIABLE_REGEX = /{{(.*?)}}/g;

/**
 * Extract all variable placeholders from text (without parsing fallbacks).
 * Returns unique list of raw inner strings (e.g. "contact_first_name" or "contact_first_name | Customer").
 *
 * @param {string} text - Template text
 * @returns {string[]} Raw matches inside {{ }}
 */
export function extractRawVariables(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  let m;
  const re = new RegExp(VARIABLE_REGEX.source, 'g');
  while ((m = re.exec(text)) !== null) {
    matches.push(m[1].trim());
  }
  return [...new Set(matches)];
}

/**
 * Extract variable keys only (no fallback), unique.
 * Example: "Hello {{contact_first_name}} from {{company_name}}" → ["contact_first_name", "company_name"]
 *
 * @param {string} text - Template text
 * @returns {string[]} Variable keys
 */
export function extractVariables(text) {
  const raw = extractRawVariables(text);
  return raw.map((r) => parseVariableWithFallback(r).variable).filter(Boolean);
}

/**
 * Parse a single raw variable string (e.g. "contact_first_name | Customer") into { variable, fallback }.
 *
 * @param {string} raw - One raw inner string from {{ ... }}
 * @returns {{ variable: string, fallback: string | null }}
 */
export function parseVariableWithFallback(raw) {
  if (!raw || typeof raw !== 'string') return { variable: '', fallback: null };
  const pipe = raw.indexOf('|');
  if (pipe === -1) {
    return { variable: raw.trim(), fallback: null };
  }
  const variable = raw.slice(0, pipe).trim();
  const fallback = raw.slice(pipe + 1).trim() || null;
  return { variable, fallback };
}
