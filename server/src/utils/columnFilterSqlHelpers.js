/**
 * Shared SQL fragments for list column_filters (text + date/number comparisons).
 */

export const TEXT_COLUMN_FILTER_OPS = new Set([
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'empty',
  'not_empty',
]);

export const COMPARABLE_COLUMN_FILTER_OPS = new Set([
  'eq',
  'lt',
  'lte',
  'gt',
  'gte',
  'between',
  'empty',
  'not_empty',
]);

export const COLUMN_FILTER_OPS = new Set([
  ...TEXT_COLUMN_FILTER_OPS,
  ...COMPARABLE_COLUMN_FILTER_OPS,
]);

export function isComparableColumnOp(op) {
  return COMPARABLE_COLUMN_FILTER_OPS.has(op) && op !== 'empty' && op !== 'not_empty';
}

/**
 * @param {string[]} whereClauses
 * @param {unknown[]} params
 * @param {string} expr — SQL expression (e.g. `c.email`, `CAST(x AS CHAR)`)
 * @param {string} op
 * @param {string} value
 */
export function appendTextColumnFilter(whereClauses, params, expr, op, value) {
  const likeWord = (v) => `%${v}%`;
  const starts = (v) => `${v}%`;
  const ends = (v) => `%${v}`;

  if (op === 'empty') {
    whereClauses.push(`((${expr}) IS NULL OR TRIM(CAST(${expr} AS CHAR)) = '')`);
    return;
  }
  if (op === 'not_empty') {
    whereClauses.push(`((${expr}) IS NOT NULL AND TRIM(CAST(${expr} AS CHAR)) != '')`);
    return;
  }
  if (op === 'contains') {
    whereClauses.push(`(CAST(${expr} AS CHAR) LIKE ?)`);
    params.push(likeWord(value));
    return;
  }
  if (op === 'not_contains') {
    whereClauses.push(`((${expr}) IS NULL OR CAST(${expr} AS CHAR) NOT LIKE ?)`);
    params.push(likeWord(value));
    return;
  }
  if (op === 'starts_with') {
    whereClauses.push(`(CAST(${expr} AS CHAR) LIKE ?)`);
    params.push(starts(value));
    return;
  }
  if (op === 'ends_with') {
    whereClauses.push(`(CAST(${expr} AS CHAR) LIKE ?)`);
    params.push(ends(value));
  }
}

/**
 * Date or numeric column comparison. For calendar dates (YYYY-MM-DD), uses DATE() when useDateOnly.
 *
 * @param {string[]} whereClauses
 * @param {unknown[]} params
 * @param {string} colSql — column SQL (e.g. `c.created_at`)
 * @param {string} op
 * @param {string} value
 * @param {string} [value2] — end of range for `between`
 * @param {{ useDateOnly?: boolean }} [opts]
 */
export function appendComparableColumnFilter(whereClauses, params, colSql, op, value, value2, opts = {}) {
  const { useDateOnly = false } = opts;
  const col = useDateOnly ? `DATE(${colSql})` : colSql;

  if (op === 'empty') {
    whereClauses.push(`(${colSql} IS NULL)`);
    return;
  }
  if (op === 'not_empty') {
    whereClauses.push(`(${colSql} IS NOT NULL)`);
    return;
  }
  if (op === 'between') {
    whereClauses.push(`(${col} >= ? AND ${col} <= ?)`);
    params.push(value, value2);
    return;
  }
  const cmp = { eq: '=', lt: '<', lte: '<=', gt: '>', gte: '>=' }[op];
  if (!cmp) return;
  whereClauses.push(`(${col} ${cmp} ?)`);
  params.push(value);
}
