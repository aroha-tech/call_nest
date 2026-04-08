export const CUSTOM_FIELD_COL_PREFIX = 'cf:';

/**
 * @param {number|string} fieldId
 * @returns {string}
 */
export function customFieldColumnId(fieldId) {
  return `${CUSTOM_FIELD_COL_PREFIX}${fieldId}`;
}

/**
 * @param {string} columnId
 * @returns {number | null}
 */
export function parseCustomFieldColumnId(columnId) {
  if (!columnId || typeof columnId !== 'string') return null;
  if (!columnId.startsWith(CUSTOM_FIELD_COL_PREFIX)) return null;
  const n = Number(columnId.slice(CUSTOM_FIELD_COL_PREFIX.length));
  return Number.isFinite(n) ? n : null;
}

