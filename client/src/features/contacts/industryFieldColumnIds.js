export const INDUSTRY_FIELD_COL_PREFIX = 'ind:';

/**
 * @param {string} fieldKey
 * @returns {string}
 */
export function industryFieldColumnId(fieldKey) {
  return `${INDUSTRY_FIELD_COL_PREFIX}${fieldKey}`;
}

/**
 * @param {string} columnId
 * @returns {string | null}
 */
export function parseIndustryFieldColumnId(columnId) {
  if (!columnId || typeof columnId !== 'string') return null;
  if (!columnId.startsWith(INDUSTRY_FIELD_COL_PREFIX)) return null;
  const key = columnId.slice(INDUSTRY_FIELD_COL_PREFIX.length);
  return key || null;
}
