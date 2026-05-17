/** Shared formatting and usage-level helpers for call credit / telephony UI. */

export function formatPaiseAsInr(paise) {
  const n = Number(paise) / 100;
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

export function formatMinutes(min) {
  const n = Number(min);
  if (!Number.isFinite(n)) return '0 min';
  if (n < 60) return `${Math.round(n)} min`;
  const h = Math.floor(n / 60);
  const m = Math.round(n - h * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** @returns {'ok' | 'warning' | 'danger' | null} */
export function getUsageLevel(usedPct, { exceeded = false } = {}) {
  if (exceeded) return 'danger';
  const pct = Number(usedPct);
  if (!Number.isFinite(pct)) return null;
  if (pct >= 80) return 'danger';
  if (pct >= 60) return 'warning';
  return 'ok';
}

/** Credit-wallet usage as % of purchased / current pool (for progress bar). */
export function computeCreditUsagePct(wallet) {
  const topup = Number(wallet?.lifetime_topup_paise) || 0;
  const spent = Number(wallet?.lifetime_spent_paise) || 0;
  const balance = Number(wallet?.balance_paise) || 0;
  if (topup > 0) {
    return Math.min(100, Math.round((spent / topup) * 100));
  }
  const pool = spent + balance;
  if (pool > 0) {
    return Math.min(100, Math.round((spent / pool) * 100));
  }
  return null;
}
