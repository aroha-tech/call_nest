/**
 * Parse optional dashboard date filters from query strings.
 * Expects `from` and `to` as YYYY-MM-DD (inclusive). Both required when filtering.
 *
 * @param {string|undefined} fromStr
 * @param {string|undefined} toStr
 * @returns {{ fromDate: string, toDate: string } | null}
 */
export function parseInclusiveDateRange(fromStr, toStr) {
  if (fromStr == null || toStr == null) return null;
  const from = String(fromStr).trim();
  const to = String(toStr).trim();
  if (!from || !to) return null;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return null;
  if (from > to) return null;
  return { fromDate: from, toDate: to };
}

/**
 * SQL fragment and params for `DATE(col) BETWEEN ? AND ?` (inclusive calendar dates).
 * @param {string} columnExpr - e.g. 'created_at' or 'u.created_at'
 * @param {{ fromDate: string, toDate: string }} range
 * @returns {{ clause: string, params: string[] }}
 */
export function sqlDateBetweenInclusive(columnExpr, range) {
  return {
    clause: ` AND DATE(${columnExpr}) >= ? AND DATE(${columnExpr}) <= ? `,
    params: [range.fromDate, range.toDate],
  };
}
