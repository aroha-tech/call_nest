/**
 * Template variables are system-level (no tenant_id).
 * Used by template editors and validation.
 */

import { query } from '../config/db.js';

/**
 * Get all active variable keys (for validation).
 * @returns {Promise<string[]>}
 */
export async function getActiveVariableKeys() {
  const rows = await query(
    'SELECT variable_key FROM template_variables WHERE is_active = 1'
  );
  return rows.map((r) => r.variable_key);
}

/**
 * Get active variables grouped by module for API response.
 * @returns {Promise<Record<string, Array<{ key: string, label: string }>>>}
 */
export async function getActiveGroupedByModule() {
  const rows = await query(
    `SELECT variable_key, variable_label, module
     FROM template_variables
     WHERE is_active = 1
     ORDER BY module, variable_key`
  );
  const grouped = {};
  for (const row of rows) {
    const moduleKey = row.module;
    if (!grouped[moduleKey]) grouped[moduleKey] = [];
    grouped[moduleKey].push({
      key: row.variable_key,
      label: row.variable_label,
    });
  }
  return grouped;
}

/**
 * Get variable_key -> sample_value for all active variables (for preview).
 * Only includes keys where sample_value is not null/empty.
 * If sample_value column does not exist yet (migration not run), returns {}.
 * @returns {Promise<Record<string, string>>}
 */
export async function getPreviewSampleData() {
  try {
    const rows = await query(
      `SELECT variable_key, sample_value FROM template_variables
       WHERE is_active = 1 AND sample_value IS NOT NULL AND sample_value != ''`
    );
    const map = {};
    for (const row of rows) {
      map[row.variable_key] = String(row.sample_value).trim();
    }
    return map;
  } catch (err) {
    if (err.errno === 1054) {
      return {};
    }
    throw err;
  }
}
