import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { InfoHelpIcon } from './InfoHelpIcon';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import { TIME_FORMAT_12H, TIME_FORMAT_12H_WITH_SECONDS } from '../../utils/dateTimeDisplay';
import {
  compareLocalDay,
  dateToDateOnlyString,
  dateToDateTimeLocalString,
  getMonthCalendarCells,
  isSameLocalDay,
  parseDateOnly,
  parseDateTimeLocal,
  parseToLocalDay,
  startOfLocalDay,
} from './dateTimePickerUtils';
import styles from './DateTimePickerField.module.scss';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function CalendarGlyph({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function parseLabel(label) {
  if (typeof label !== 'string') {
    return { text: label, hasStar: false };
  }
  const t = label.trimEnd();
  if (!t.endsWith('*')) return { text: label, hasStar: false };
  return { text: t.slice(0, -1).trimEnd(), hasStar: true };
}

function clampMinMax(day, minS, maxS, mode) {
  let d = startOfLocalDay(day);
  if (!d) return null;
  if (mode === 'date') {
    if (minS) {
      const m = parseDateOnly(minS);
      if (m && compareLocalDay(d, m) < 0) d = m;
    }
    if (maxS) {
      const m = parseDateOnly(maxS);
      if (m && compareLocalDay(d, m) > 0) d = m;
    }
  } else {
    const minD = minS ? parseDateTimeLocal(minS) : null;
    const maxD = maxS ? parseDateTimeLocal(maxS) : null;
    if (minD && d.getTime() < startOfLocalDay(minD).getTime()) d = startOfLocalDay(minD);
    if (maxD && d.getTime() > startOfLocalDay(maxD).getTime()) d = startOfLocalDay(maxD);
  }
  return d;
}

/**
 * Custom date or date+time field (popover picker). `value` / `onChange` use the same strings as native date inputs.
 * @param {'date'|'datetime'} mode
 */
export function DateTimePickerField({
  id,
  label,
  hint,
  'aria-label': ariaLabel,
  value,
  onChange,
  mode = 'datetime',
  min,
  max,
  placeholder = 'Select…',
  disabled = false,
  error,
  required = false,
  className = '',
  inputClassName = '',
}) {
  const uid = useId();
  const fieldId = id || `dtp-${uid}`;
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [showMonthPick, setShowMonthPick] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const { formatDate, formatDateTime, datetimePreferences } = useDateTimeDisplay();
  const prefers12HourPicker = useMemo(() => {
    const tf = datetimePreferences.timeFormat;
    return tf === TIME_FORMAT_12H || tf === TIME_FORMAT_12H_WITH_SECONDS;
  }, [datetimePreferences.timeFormat]);
  const [use12h, setUse12h] = useState(prefers12HourPicker);

  useEffect(() => {
    setUse12h(prefers12HourPicker);
  }, [prefers12HourPicker]);

  const parsedValue = useMemo(() => {
    if (mode === 'date') return parseDateOnly(value);
    return parseDateTimeLocal(value);
  }, [value, mode]);

  const initialDraft = useMemo(() => {
    if (parsedValue) return new Date(parsedValue.getTime());
    return new Date();
  }, [parsedValue, open]);

  const [viewYear, setViewYear] = useState(() => initialDraft.getFullYear());
  const [viewMonth0, setViewMonth0] = useState(() => initialDraft.getMonth());
  const [draftDay, setDraftDay] = useState(() => initialDraft);
  const [draftH, setDraftH] = useState(() => initialDraft.getHours());
  const [draftM, setDraftM] = useState(() => initialDraft.getMinutes());

  useEffect(() => {
    if (!open) return;
    const base = parsedValue ? new Date(parsedValue.getTime()) : new Date();
    setViewYear(base.getFullYear());
    setViewMonth0(base.getMonth());
    setDraftDay(base);
    setDraftH(base.getHours());
    setDraftM(base.getMinutes());
    setShowMonthPick(false);
  }, [open, parsedValue]);

  const cells = useMemo(() => getMonthCalendarCells(viewYear, viewMonth0), [viewYear, viewMonth0]);

  const display = useMemo(() => {
    if (!value) return '';
    if (mode === 'date') return formatDate(value);
    return formatDateTime(value);
  }, [value, mode, formatDate, formatDateTime]);

  const positionPopover = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pw = mode === 'datetime' ? 520 : 312;
    const gap = 6;
    const pad = 12;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const maxPopH = Math.min(520, vh - 24);

    let left = r.left;
    if (left + pw > vw - pad) left = vw - pw - pad;
    if (left < pad) left = pad;

    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;
    let top = r.bottom + gap;
    if (spaceBelow < Math.min(maxPopH, 260) && spaceAbove > spaceBelow) {
      top = r.top - maxPopH - gap;
      if (top < pad) top = pad;
    }

    setPos({ top, left });
  }, [mode]);

  useLayoutEffect(() => {
    if (!open) return;
    positionPopover();
  }, [open, positionPopover]);

  useLayoutEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const pop = popRef.current;
      if (!pop) return;
      const pad = 12;
      const rect = pop.getBoundingClientRect();
      let adjust = 0;
      const bottomOver = rect.bottom - (window.innerHeight - pad);
      if (bottomOver > 0) adjust -= bottomOver;
      const topUnder = pad - rect.top;
      if (topUnder > 0) adjust += topUnder;
      if (adjust !== 0) setPos((p) => ({ ...p, top: p.top + adjust }));
    });
    return () => cancelAnimationFrame(id);
  }, [open, showMonthPick, viewYear, viewMonth0, mode]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => positionPopover();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, positionPopover]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e) => {
      const t = e.target;
      if (wrapRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const commitDay = (d) => {
    const c = clampMinMax(d, min, max, mode);
    if (c) setDraftDay(c);
  };

  const onPickDay = (date) => {
    commitDay(date);
  };

  const applyCommit = () => {
    let out;
    if (mode === 'date') {
      out = dateToDateOnlyString(draftDay);
    } else {
      const d = new Date(draftDay);
      d.setHours(draftH, draftM, 0, 0);
      out = dateToDateTimeLocalString(d);
    }
    onChange?.(out);
    setOpen(false);
  };

  const onClear = () => {
    onChange?.('');
    setOpen(false);
  };

  const onToday = () => {
    const n = new Date();
    commitDay(n);
    if (mode === 'datetime') {
      setDraftH(n.getHours());
      setDraftM(n.getMinutes());
    }
  };

  const { hour12, ampm } = useMemo(() => {
    const h = draftH % 24;
    const pm = h >= 12;
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return { hour12: h12, ampm: pm ? 'PM' : 'AM' };
  }, [draftH]);

  const incHour = () => setDraftH((h) => (h + 1) % 24);
  const decHour = () => setDraftH((h) => (h - 1 + 24) % 24);
  const incMin = () => setDraftM((m) => (m + 1) % 60);
  const decMin = () => setDraftM((m) => (m - 1 + 60) % 60);

  const prevH24 = (draftH - 1 + 24) % 24;
  const nextH24 = (draftH + 1) % 24;
  const prevM = (draftM - 1 + 60) % 60;
  const nextM = (draftM + 1) % 60;

  const todayStart = startOfLocalDay(new Date());

  const isDisabledDay = (date) => {
    const d0 = startOfLocalDay(date);
    if (!d0) return true;
    if (mode === 'date') {
      if (min) {
        const m = parseDateOnly(min);
        if (m && compareLocalDay(d0, m) < 0) return true;
      }
      if (max) {
        const m = parseDateOnly(max);
        if (m && compareLocalDay(d0, m) > 0) return true;
      }
    } else {
      if (min) {
        const m = parseToLocalDay(min);
        if (m && compareLocalDay(d0, m) < 0) return true;
      }
      if (max) {
        const m = parseToLocalDay(max);
        if (m && compareLocalDay(d0, m) > 0) return true;
      }
    }
    return false;
  };

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => ({
      value: i,
      label: new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }),
    }));
  }, []);

  const yearOptions = useMemo(() => {
    const y = viewYear;
    const years = [];
    for (let i = y - 80; i <= y + 20; i++) years.push(i);
    return years;
  }, [viewYear]);

  const labelParsed = parseLabel(label);
  const showReq = required || labelParsed.hasStar;

  const popover = open
    ? createPortal(
        <div
          ref={popRef}
          className={styles.popover}
          style={{ top: pos.top, left: pos.left }}
          role="dialog"
          aria-modal="true"
          aria-label={mode === 'date' ? 'Date picker' : 'Date and time picker'}
          data-cnr-datetime-picker-popover
        >
          <div className={styles.dateSection}>
            <div className={styles.monthHeader}>
              <button
                type="button"
                className={styles.monthTitleBtn}
                onClick={() => setShowMonthPick((s) => !s)}
              >
                {new Date(viewYear, viewMonth0, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                <ChevronDown />
              </button>
              <div className={styles.monthNav}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Previous month"
                  onClick={() => {
                    if (viewMonth0 === 0) {
                      setViewMonth0(11);
                      setViewYear((y) => y - 1);
                    } else setViewMonth0((m) => m - 1);
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label="Next month"
                  onClick={() => {
                    if (viewMonth0 === 11) {
                      setViewMonth0(0);
                      setViewYear((y) => y + 1);
                    } else setViewMonth0((m) => m + 1);
                  }}
                >
                  ›
                </button>
              </div>
            </div>
            {showMonthPick ? (
              <div className={styles.monthPanel}>
                <div className={styles.monthSelectRow}>
                  <select
                    className={styles.monthSelect}
                    value={viewMonth0}
                    onChange={(e) => setViewMonth0(Number(e.target.value))}
                  >
                    {monthOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={styles.monthSelect}
                    value={viewYear}
                    onChange={(e) => setViewYear(Number(e.target.value))}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <div className={styles.weekdays}>
              {WEEKDAYS.map((w) => (
                <div key={w} className={styles.weekday}>
                  {w}
                </div>
              ))}
            </div>
            <div className={styles.grid}>
              {cells.map(({ date, inCurrentMonth }, idx) => {
                const dis = isDisabledDay(date);
                const sel = isSameLocalDay(date, draftDay);
                const isToday = todayStart && isSameLocalDay(date, todayStart);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={dis}
                    className={`${styles.dayCell} ${!inCurrentMonth ? styles.dayMuted : ''} ${
                      isToday && !sel ? styles.dayToday : ''
                    } ${sel ? styles.daySelected : ''}`.trim()}
                    onClick={() => onPickDay(date)}
                  >
                    {date.getDate()}
                  </button>
                );
              })}
            </div>
            <div className={styles.dateFooter}>
              <button type="button" className={styles.ghostBtn} onClick={onClear}>
                Clear
              </button>
              <button type="button" className={styles.ghostBtn} onClick={onToday}>
                Today
              </button>
              {mode === 'date' ? (
                <div className={styles.dateFooterActions}>
                  <button type="button" className={styles.primaryBtn} onClick={applyCommit}>
                    Apply
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {mode === 'datetime' ? (
            <div className={styles.timeSection}>
              <div className={styles.timeSectionBody}>
                <div className={styles.timeHeader}>Time</div>
                <div className={styles.segmentRow}>
                  <button
                    type="button"
                    className={`${styles.segment} ${use12h ? styles.segmentActive : ''}`.trim()}
                    onClick={() => setUse12h(true)}
                  >
                    12h
                  </button>
                  <button
                    type="button"
                    className={`${styles.segment} ${!use12h ? styles.segmentActive : ''}`.trim()}
                    onClick={() => setUse12h(false)}
                  >
                    24h
                  </button>
                </div>
                <div className={styles.columns}>
                <div className={styles.column}>
                  <span className={styles.columnLabel}>Hr</span>
                  <button type="button" className={styles.stepBtn} aria-label="Hour up" onClick={incHour}>
                    ▲
                  </button>
                  <span className={styles.wheelGhost}>
                    {String(use12h ? (prevH24 % 12 || 12) : prevH24).padStart(2, '0')}
                  </span>
                  <div className={styles.wheelSlot}>
                    {String(use12h ? hour12 : draftH % 24).padStart(2, '0')}
                  </div>
                  <span className={styles.wheelGhost}>
                    {String(use12h ? (nextH24 % 12 || 12) : nextH24).padStart(2, '0')}
                  </span>
                  <button type="button" className={styles.stepBtn} aria-label="Hour down" onClick={decHour}>
                    ▼
                  </button>
                </div>
                <div className={styles.column}>
                  <span className={styles.columnLabel}>Min</span>
                  <button type="button" className={styles.stepBtn} aria-label="Minute up" onClick={incMin}>
                    ▲
                  </button>
                  <span className={styles.wheelGhost}>{String(prevM).padStart(2, '0')}</span>
                  <div className={styles.wheelSlot}>{String(draftM).padStart(2, '0')}</div>
                  <span className={styles.wheelGhost}>{String(nextM).padStart(2, '0')}</span>
                  <button type="button" className={styles.stepBtn} aria-label="Minute down" onClick={decMin}>
                    ▼
                  </button>
                </div>
                {use12h ? (
                  <div className={styles.column}>
                    <span className={`${styles.columnLabel} ${styles.columnLabelSpacer}`.trim()} aria-hidden>
                      Hr
                    </span>
                    <button type="button" className={styles.stepBtn} aria-label="Toggle AM PM" onClick={() => setDraftH((h) => (h + 12) % 24)}>
                      ▲
                    </button>
                    <span className={styles.wheelGhost}>{ampm === 'AM' ? 'PM' : 'AM'}</span>
                    <div className={styles.wheelSlot}>{ampm}</div>
                    <span className={styles.wheelGhost}>{ampm === 'AM' ? 'PM' : 'AM'}</span>
                    <button type="button" className={styles.stepBtn} aria-label="Toggle AM PM" onClick={() => setDraftH((h) => (h + 12) % 24)}>
                      ▼
                    </button>
                  </div>
                ) : null}
                </div>
              </div>
              <button type="button" className={styles.primaryBtn} onClick={applyCommit}>
                Apply
              </button>
            </div>
          ) : null}
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={wrapRef} className={`${styles.field} ${className}`.trim()}>
      {label ? (
        <div className={styles.labelRow}>
          <label htmlFor={fieldId} className={styles.label}>
            {labelParsed.text}
            {showReq ? <span className={styles.requiredMark}> *</span> : null}
          </label>
          <InfoHelpIcon title={`${label} info`} modalTitle={label} message={hint} />
        </div>
      ) : null}
      <button
        id={fieldId}
        type="button"
        className={`${styles.trigger} ${inputClassName} ${error ? styles.triggerHasError : ''}`.trim()}
        disabled={disabled}
        aria-invalid={!!error}
        aria-expanded={open}
        aria-label={ariaLabel || (typeof labelParsed.text === 'string' ? labelParsed.text : undefined)}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <CalendarGlyph className={styles.calIcon} />
        <span className={display ? styles.triggerValue : `${styles.triggerValue} ${styles.triggerPlaceholder}`.trim()}>
          {display || placeholder}
        </span>
      </button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {popover}
    </div>
  );
}
