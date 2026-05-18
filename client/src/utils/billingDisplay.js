/** Shared billing UI helpers for Plans & billing and history pages. */

export const BILLING_PREVIEW_LIMIT = 5;

export const BILLING_HISTORY_ROUTES = {
  payments: '/settings/billing/history/payments',
  subscriptions: '/settings/billing/history/subscriptions',
  wallet: '/settings/billing/history/wallet',
};

export function formatBillingInr(paise) {
  const n = Number(paise) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n);
}

export function parseBillingDbDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const iso = str.includes('T') ? str : str.replace(' ', 'T');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function subscriptionTimeline(current) {
  if (!current) return null;
  const start = parseBillingDbDate(current.current_period_start);
  const end = parseBillingDbDate(current.current_period_end);
  const now = Date.now();
  if (!start || !end) return null;
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = now - start.getTime();
  let pct = 0;
  if (totalMs > 0) {
    pct = Math.round(Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100)));
  }
  const msDay = 86400000;
  const rawDays = Math.ceil((end.getTime() - now) / msDay);
  const expired = end.getTime() < now;
  const daysLeft = expired ? 0 : Math.max(0, rawDays);
  let urgency = 'ok';
  if (expired) urgency = 'critical';
  else if (rawDays <= 7) urgency = 'soon';
  else if (rawDays <= 14) urgency = 'notice';

  return { pct: expired ? 100 : pct, daysLeft, expired, urgency, end, start };
}

export function paymentBadgeMeta(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'captured':
      return { label: 'Payment received', variant: 'success' };
    case 'failed':
      return { label: 'Payment failed', variant: 'danger' };
    case 'refunded':
      return { label: 'Refunded', variant: 'warning' };
    case 'authorized':
      return { label: 'Authorized', variant: 'info' };
    case 'created':
      return { label: 'Pending', variant: 'muted' };
    default:
      return { label: s ? s.replace(/_/g, ' ') : 'Unknown', variant: 'default' };
  }
}

export function subscriptionBadgeMeta(status) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'active':
      return { label: 'Active', variant: 'success' };
    case 'expired':
      return { label: 'Expired', variant: 'muted' };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'warning' };
    case 'pending':
      return { label: 'Pending', variant: 'info' };
    default:
      return { label: s ? s.replace(/_/g, ' ') : '—', variant: 'default' };
  }
}

export function cycleBadgeMeta(timeline, subStatus) {
  if (String(subStatus || '').toLowerCase() !== 'active') {
    return { label: String(subStatus || 'inactive'), variant: 'muted' };
  }
  if (!timeline) return { label: 'Active', variant: 'success' };
  if (timeline.expired) return { label: 'Renewal overdue', variant: 'danger' };
  if (timeline.urgency === 'soon') return { label: 'Renews soon', variant: 'warning' };
  return { label: 'Active', variant: 'success' };
}
