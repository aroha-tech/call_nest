/**
 * Holds uploaded CSV/Excel bytes for background import jobs until the in-process worker consumes them.
 * Avoids Windows EPERM / AV blocking writes under Temp or the repo. Same Node process only.
 */

/** @type {Map<number, Buffer>} */
const byJobId = new Map();

export function stashBackgroundImportBuffer(jobId, buffer) {
  if (buffer == null || !Buffer.isBuffer(buffer)) return;
  byJobId.set(Number(jobId), buffer);
}

/** Removes and returns the buffer; call once when starting the import job. */
export function takeBackgroundImportBuffer(jobId) {
  const id = Number(jobId);
  const buf = byJobId.get(id);
  byJobId.delete(id);
  return buf ?? null;
}

export function discardBackgroundImportBuffer(jobId) {
  byJobId.delete(Number(jobId));
}
