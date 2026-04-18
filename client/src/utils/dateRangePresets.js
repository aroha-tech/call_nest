/** Preset ids for list/dashboard time filters (default: all time). */

export const TIME_RANGE_PRESET = {
  ALL_TIME: 'all_time',
  ONE_DAY: '1d',
  ONE_WEEK: '1w',
  ONE_MONTH: '1m',
  SIX_MONTHS: '6m',
  ONE_YEAR: '1y',
  CUSTOM: 'custom',
  /** Legacy call-history saves that used server CURDATE() */
  TODAY_CALENDAR: 'today_calendar',
};

const VALID_PRESETS = new Set(Object.values(TIME_RANGE_PRESET));

/** Labels describe rolling windows ending now (not fixed calendar periods), except All time / Custom. */
export const TIME_RANGE_PRESET_OPTIONS = [
  { value: TIME_RANGE_PRESET.ALL_TIME, label: 'All time' },
  { value: TIME_RANGE_PRESET.ONE_MONTH, label: 'Last 30 days' },
  { value: TIME_RANGE_PRESET.ONE_WEEK, label: 'Last 7 days' },
  { value: TIME_RANGE_PRESET.ONE_DAY, label: 'Last 24 hours' },
  { value: TIME_RANGE_PRESET.SIX_MONTHS, label: 'Last 6 months' },
  { value: TIME_RANGE_PRESET.ONE_YEAR, label: 'Last 12 months' },
  { value: TIME_RANGE_PRESET.CUSTOM, label: 'Custom range' },
];

export const TIME_RANGE_LEGACY_TODAY_OPTION = {
  value: TIME_RANGE_PRESET.TODAY_CALENDAR,
  label: 'Today only',
};

function trimOrUndef(s) {
  const t = String(s ?? '').trim();
  return t || undefined;
}

function rollingStartForPreset(preset, now) {
  const d = new Date(now.getTime());
  switch (preset) {
    case TIME_RANGE_PRESET.ONE_DAY:
      d.setDate(d.getDate() - 1);
      return d;
    case TIME_RANGE_PRESET.ONE_WEEK:
      d.setDate(d.getDate() - 7);
      return d;
    case TIME_RANGE_PRESET.ONE_MONTH:
      d.setDate(d.getDate() - 30);
      return d;
    case TIME_RANGE_PRESET.SIX_MONTHS:
      d.setMonth(d.getMonth() - 6);
      return d;
    case TIME_RANGE_PRESET.ONE_YEAR:
      d.setFullYear(d.getFullYear() - 1);
      return d;
    default:
      return d;
  }
}

export function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Call attempt list/metrics/export (started_at + optional today_only). */
export function resolveCallHistoryListParams(preset, customAfter, customBefore, now = new Date()) {
  if (preset === TIME_RANGE_PRESET.ALL_TIME) {
    return { started_after: undefined, started_before: undefined, today_only: false };
  }
  if (preset === TIME_RANGE_PRESET.TODAY_CALENDAR) {
    return { started_after: undefined, started_before: undefined, today_only: true };
  }
  if (preset === TIME_RANGE_PRESET.CUSTOM) {
    return {
      started_after: trimOrUndef(customAfter),
      started_before: trimOrUndef(customBefore),
      today_only: false,
    };
  }
  const start = rollingStartForPreset(preset, now);
  return {
    started_after: start.toISOString(),
    started_before: now.toISOString(),
    today_only: false,
  };
}

/** Dialer sessions list (created_at). */
export function resolveDialSessionCreatedParams(preset, customAfter, customBefore, now = new Date()) {
  if (preset === TIME_RANGE_PRESET.ALL_TIME) {
    return { created_after: undefined, created_before: undefined };
  }
  if (preset === TIME_RANGE_PRESET.CUSTOM) {
    return {
      created_after: trimOrUndef(customAfter),
      created_before: trimOrUndef(customBefore),
    };
  }
  const start = rollingStartForPreset(preset, now);
  return {
    created_after: start.toISOString(),
    created_before: now.toISOString(),
  };
}

/**
 * Tenant/platform dashboard: inclusive YYYY-MM-DD on created_at.
 * Returns null for all time or invalid custom.
 */
export function computeDashboardInclusiveDates(preset, customFrom, customTo, now = new Date()) {
  if (preset === TIME_RANGE_PRESET.ALL_TIME) return null;
  if (preset === TIME_RANGE_PRESET.TODAY_CALENDAR) {
    const t = formatLocalYmd(now);
    return { from: t, to: t };
  }
  if (preset === TIME_RANGE_PRESET.CUSTOM) {
    const from = String(customFrom ?? '').trim();
    const to = String(customTo ?? '').trim();
    if (!from || !to || from > to) return null;
    return { from, to };
  }
  const to = formatLocalYmd(now);
  const startD = rollingStartForPreset(preset, now);
  const from = formatLocalYmd(startD);
  if (from > to) return { from: to, to };
  return { from, to };
}

export function inferCallHistoryTimePresetFromLegacySnapshot(snap) {
  if (!snap) {
    return { preset: TIME_RANGE_PRESET.ALL_TIME, customAfter: '', customBefore: '' };
  }
  const p = snap.timeRangePreset;
  if (p && VALID_PRESETS.has(p)) {
    return {
      preset: p,
      customAfter: snap.customStartedAfter ?? '',
      customBefore: snap.customStartedBefore ?? '',
    };
  }
  if (snap.todayOnly) {
    return { preset: TIME_RANGE_PRESET.TODAY_CALENDAR, customAfter: '', customBefore: '' };
  }
  const a = String(snap.startedAfter ?? '').trim();
  const b = String(snap.startedBefore ?? '').trim();
  if (!a && !b) {
    return { preset: TIME_RANGE_PRESET.ALL_TIME, customAfter: '', customBefore: '' };
  }
  return { preset: TIME_RANGE_PRESET.CUSTOM, customAfter: a, customBefore: b };
}
