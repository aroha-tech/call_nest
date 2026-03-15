/**
 * Client-side template variable helpers.
 * For variable detection, preview rendering, and autocomplete.
 */

const VARIABLE_REGEX = /{{(.*?)}}/g;

/**
 * Extract variable keys from text (unique).
 * Example: "Hello {{contact_first_name}} from {{company_name}}" → ["contact_first_name", "company_name"]
 * @param {string} text
 * @returns {string[]}
 */
export function extractVariables(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [];
  let m;
  const re = new RegExp(VARIABLE_REGEX.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].trim();
    const pipe = raw.indexOf('|');
    const key = pipe === -1 ? raw : raw.slice(0, pipe).trim();
    if (key) matches.push(key);
  }
  return [...new Set(matches)];
}

/**
 * Parse a single raw variable string (e.g. "contact_first_name | Customer").
 * @param {string} raw
 * @returns {{ variable: string, fallback: string | null }}
 */
export function parseVariableWithFallback(raw) {
  if (!raw || typeof raw !== 'string') return { variable: '', fallback: null };
  const pipe = raw.indexOf('|');
  if (pipe === -1) return { variable: raw.trim(), fallback: null };
  return {
    variable: raw.slice(0, pipe).trim(),
    fallback: raw.slice(pipe + 1).trim() || null,
  };
}

/**
 * Replace variables in template text with values from sampleData.
 * Supports {{key}} and {{key | fallback}}; uses fallback when key is missing in sampleData.
 *
 * @param {string} templateText - e.g. "Hello {{contact_first_name | Customer}}, from {{company_name}}"
 * @param {Record<string, string>} sampleData - e.g. { contact_first_name: "Rahul", company_name: "Arohva" }
 * @returns {string} Rendered text with variables replaced
 */
export function renderPreview(templateText, sampleData = {}) {
  if (!templateText || typeof templateText !== 'string') return '';
  return templateText.replace(VARIABLE_REGEX, (_, raw) => {
    const trimmed = raw.trim();
    const { variable, fallback } = parseVariableWithFallback(trimmed);
    const value = sampleData[variable];
    if (value !== undefined && value !== null && value !== '') {
      return String(value);
    }
    if (fallback !== null) {
      return fallback;
    }
    return `{{${trimmed}}}`;
  });
}

/**
 * Turn URLs in plain text into clickable links (HTML string).
 * Escapes HTML first so the result is safe for dangerouslySetInnerHTML.
 * @param {string} text - Plain text (e.g. rendered preview)
 * @returns {string} HTML with <a> tags for URLs
 */
export function linkify(text) {
  if (!text || typeof text !== 'string') return '';
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const urlRegex = /(https?:\/\/[^\s<>]+)/g;
  return escaped.replace(urlRegex, (url) =>
    `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer" class="template-preview-link">${url}</a>`
  );
}

/**
 * Make URLs in HTML clickable (only in text nodes; does not escape tags).
 * Use after variable replacement when content is HTML.
 * @param {string} html
 * @returns {string}
 */
export function linkifyHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const wrapUrls = (text) =>
    text.replace(
      /(https?:\/\/[^\s<>"]+)/g,
      (url) =>
        `<a href="${url.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
  return html.replace(/>([^<]*)</g, (_, text) => '>' + wrapUrls(text) + '<');
}

/**
 * Strip HTML to plain text (for autocomplete when editor content is HTML).
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Filter variable list by prefix (case-insensitive) for autocomplete.
 * @param {Array<{ key: string, label: string }>} variables
 * @param {string} prefix
 * @returns {Array<{ key: string, label: string }>}
 */
export function getSuggestionsForPrefix(variables, prefix = '') {
  if (!Array.isArray(variables) || variables.length === 0) return [];
  const p = prefix.trim().toLowerCase();
  if (!p) return variables;
  return variables.filter(
    (v) => v.key && v.key.toLowerCase().startsWith(p)
  );
}

/**
 * Get the "query" part after the last unclosed "{{" before cursor.
 * Example: "Hello {{contact_" with cursor at end → "contact_"
 * @param {string} text
 * @param {number} cursorPosition
 * @returns {{ query: string, startIndex: number } | null}
 */
export function getAutocompleteContext(text, cursorPosition) {
  if (!text || cursorPosition == null) return null;
  const before = text.slice(0, cursorPosition);
  const lastOpen = before.lastIndexOf('{{');
  if (lastOpen === -1) return null;
  const afterOpen = before.slice(lastOpen + 2);
  const closePos = afterOpen.indexOf('}}');
  if (closePos !== -1) return null;
  return {
    query: afterOpen.trim(),
    startIndex: lastOpen,
  };
}

/**
 * Default sample data for preview (labels as values).
 */
export const DEFAULT_PREVIEW_DATA = {
  contact_first_name: 'Rahul',
  contact_last_name: 'Sharma',
  contact_full_name: 'Rahul Sharma',
  contact_phone: '+91 98765 43210',
  contact_email: 'rahul@example.com',
  agent_name: 'Amit',
  agent_email: 'amit@company.com',
  company_name: 'Arohva',
  company_phone: '+91 1800 123 456',
  company_email: 'hello@arohva.com',
  today_date: new Date().toLocaleDateString(),
  current_time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  // Link variables (sample URLs for preview)
  booking_link: 'https://book.example.com/schedule',
  form_link: 'https://forms.example.com/survey',
  company_website: 'https://arohva.com',
  support_link: 'https://support.arohva.com',
  portal_link: 'https://portal.arohva.com',
};
