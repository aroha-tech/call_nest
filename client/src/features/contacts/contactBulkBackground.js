/**
 * Bulk toolbar actions: above this count (or when “Select all matching” is on), use background jobs
 * so the HTTP request returns immediately and progress streams over Socket.IO.
 */
export const BULK_USE_BACKGROUND_THRESHOLD = 400;

export function bulkShouldUseBackgroundJob(selectionIsAllMatching, selectedCount) {
  return Boolean(selectionIsAllMatching) || selectedCount > BULK_USE_BACKGROUND_THRESHOLD;
}

/** Strip empty fields; same shape as contacts list / export filters for `list_filter` on job APIs. */
export function listFilterPayloadFromExportParams(exportListParams) {
  if (!exportListParams || typeof exportListParams !== 'object') return {};
  const out = { ...exportListParams };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (v === undefined || v === '') delete out[k];
    else if (Array.isArray(v) && v.length === 0) delete out[k];
  }
  return out;
}
