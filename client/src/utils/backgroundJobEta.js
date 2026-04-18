/** ETA needs enough real processing time + rows so rate isn’t dominated by queue/setup or one noisy tick. */
export const ETA_MIN_WINDOW_SEC = 6;
export const ETA_MIN_SAMPLES = 2;
export const ETA_MIN_ROWS = 20;
export const ETA_MIN_FRAC = 0.012;
export const ETA_EMA = 0.38;
export const ETA_MAX_SEC = 6 * 3600;

export const TERMINAL_JOB_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/** Rounded copy so ETA doesn’t flicker second-by-second between socket ticks. */
export function formatEtaDisplay(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 60) return `About ${Math.max(10, Math.round(sec / 10) * 10)} seconds left`;
  if (sec < 3600) {
    const m = Math.max(1, Math.round(sec / 60));
    return m === 1 ? 'About 1 minute left' : `About ${m} minutes left`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return `About ${h}h ${m}m left`;
}

/**
 * Throughput from recent samples only (ignores time job spent pending before first row progress).
 * @param {Array<{ t: number, p: number }>} samples
 */
export function computeRawEtaSec(total, processed, samples) {
  if (total <= 0 || processed <= 0 || processed >= total || samples.length < ETA_MIN_SAMPLES) return null;
  const oldest = samples[0];
  const newest = samples[samples.length - 1];
  const windowSec = (newest.t - oldest.t) / 1000;
  const deltaP = newest.p - oldest.p;
  if (windowSec < ETA_MIN_WINDOW_SEC || deltaP < 1) return null;

  const frac = processed / total;
  if (processed < ETA_MIN_ROWS && frac < ETA_MIN_FRAC) return null;

  const longRate = deltaP / windowSec;
  if (longRate <= 0) return null;
  let eta = (total - processed) / longRate;

  if (samples.length >= 2) {
    const a = samples[samples.length - 2];
    const b = samples[samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    const dp = b.p - a.p;
    if (dt >= 3 && dp > 0) {
      const shortRate = dp / dt;
      const shortEta = (total - b.p) / shortRate;
      if (Number.isFinite(shortEta) && shortEta > 0) {
        eta = eta * 0.55 + shortEta * 0.45;
      }
    }
  }

  return Math.min(Math.max(eta, 15), ETA_MAX_SEC);
}

export function humanizeStepLabel(step) {
  const s = String(step || '').toLowerCase();
  const map = {
    import_rows: 'Importing rows',
    preparing: 'Preparing your file',
    starting: 'Starting',
    delete: 'Removing records',
    add_tags: 'Updating tags',
    remove_tags: 'Updating tags',
    assign: 'Applying changes',
    import: 'Finishing up',
    export: 'Building your file',
  };
  return map[s] || null;
}
