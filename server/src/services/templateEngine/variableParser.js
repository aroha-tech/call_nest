/**
 * Parse template variable placeholders with optional fallback.
 * Syntax: {{variable_key}} or {{variable_key | fallback_value}}
 */

import { extractRawVariables, parseVariableWithFallback } from './variableDetector.js';

/**
 * Parse all variable placeholders in text into structured form.
 *
 * @param {string} text - Template text
 * @returns {Array<{ variable: string, fallback: string | null, fullMatch: string }>}
 */
export function parseVariables(text) {
  if (!text || typeof text !== 'string') return [];
  const rawList = extractRawVariables(text);
  return rawList.map((raw) => {
    const { variable, fallback } = parseVariableWithFallback(raw);
    return {
      variable,
      fallback,
      fullMatch: `{{${raw}}}`,
    };
  });
}

/**
 * Get unique variable keys from text (with optional fallback info).
 *
 * @param {string} text - Template text
 * @returns {Array<{ variable: string, fallback: string | null }>} Unique variable keys and their fallbacks
 */
export function getVariableKeysWithFallback(text) {
  const parsed = parseVariables(text);
  const seen = new Set();
  return parsed.filter((p) => {
    if (seen.has(p.variable)) return false;
    seen.add(p.variable);
    return true;
  });
}
