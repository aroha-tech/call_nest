import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDateTimeDisplay } from '../../hooks/useDateTimeDisplay';
import {
  compareLocalDay,
  dateToDateOnlyString,
  dateToDateTimeLocalString,
  getMonthCalendarCells,
  isSameLocalDay,
  parseToLocalDay,
  startOfLocalDay,
} from './dateTimePickerUtils';
import styles from './CustomDateRangeFields.module.scss';

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

function toCommittedStart(d, variant) {
  if (!d) return '';
  const x = startOfLocalDay(d);
  if (!x) return '';
  if (variant === 'date') return dateToDateOnlyString(x);
  return dateToDateTimeLocalString(new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0));
}

function toCommittedEnd(d, variant) {
  if (!d) return '';
  const x = startOfLocalDay(d);
  if (!x) return '';
  if (variant === 'date') return dateToDateOnlyString(x);
  return dateToDateTimeLocalString(new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 0, 0));
}

/**
 * From/To triggers + range calendar popover (matches custom range design).
 * @param {'date'|'datetime'} variant
 */
export function CustomDateRangeFields({
  variant = 'date',
  startValue,
  endValue,
  onCustomStartChange,
  onCustomEndChange,
  startLabel = 'From',
  endLabel = 'To',
}) {
  const wrapRef = useRef(null);
  const popRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [showMonthPick, setShowMonthPick] = useState(false);

  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth0, setViewMonth0] = useState(() => new Date().getMonth());
  const [draftStart, setDraftStart] = useState(null);
  const [draftEnd, setDraftEnd] = useState(null);
  const { formatDate } = useDateTimeDisplay();

  const syncDraftFromProps = useCallback(() => {
    const a = parseToLocalDay(startValue);
    const b = parseToLocalDay(endValue);
    setDraftStart(a ? startOfLocalDay(a) : null);
    setDraftEnd(b ? startOfLocalDay(b) : null);
    const ref = a || b || new Date();
    setViewYear(ref.getFullYear());
    setViewMonth0(ref.getMonth());
  }, [startValue, endValue]);

  useEffect(() => {
    if (open) {
      syncDraftFromProps();
      setShowMonthPick(false);
    }
  }, [open, syncDraftFromProps]);

  const cells = useMemo(() => getMonthCalendarCells(viewYear, viewMonth0), [viewYear, viewMonth0]);

  const positionPopover = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    const gap = 6;
    const pad = 12;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const maxPopH = Math.min(480, vh - 24);

    let left = r.left;
    if (left + w > vw - pad) left = vw - w - pad;
    if (left < pad) left = pad;

    const spaceBelow = vh - r.bottom - gap;
    const spaceAbove = r.top - gap;
    let top = r.bottom + gap;
    if (spaceBelow < Math.min(maxPopH, 240) && spaceAbove > spaceBelow) {
      top = r.top - maxPopH - gap;
      if (top < pad) top = pad;
    }

    setPos({ top, left });
  }, []);

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
  }, [open, showMonthPick, viewYear, viewMonth0]);

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

  const rangeBounds = useMemo(() => {
    if (!draftStart || !draftEnd) return null;
    const c = compareLocalDay(draftStart, draftEnd);
    if (c <= 0) return { lo: draftStart, hi: draftEnd };
    return { lo: draftEnd, hi: draftStart };
  }, [draftStart, draftEnd]);

  const onDayClick = (date) => {
    const d0 = startOfLocalDay(date);
    if (!d0) return;
    if (!draftStart || (draftStart && draftEnd)) {
      setDraftStart(d0);
      setDraftEnd(null);
      return;
    }
    let a = draftStart;
    let b = d0;
    if (compareLocalDay(a, b) > 0) [a, b] = [b, a];
    setDraftStart(a);
    setDraftEnd(b);
  };

  const onApply = () => {
    if (draftStart && draftEnd) {
      onCustomStartChange(toCommittedStart(draftStart, variant));
      onCustomEndChange(toCommittedEnd(draftEnd, variant));
    } else if (draftStart && !draftEnd) {
      onCustomStartChange(toCommittedStart(draftStart, variant));
      onCustomEndChange(toCommittedEnd(draftStart, variant));
    }
    setOpen(false);
  };

  const onClear = () => {
    onCustomStartChange('');
    onCustomEndChange('');
    setDraftStart(null);
    setDraftEnd(null);
    setOpen(false);
  };

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i,
        label: new Date(2000, i, 1).toLocaleString(undefined, { month: 'long' }),
      })),
    []
  );

  const yearOptions = useMemo(() => {
    const y = viewYear;
    const years = [];
    for (let i = y - 80; i <= y + 20; i++) years.push(i);
    return years;
  }, [viewYear]);

  const disp = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return '—';
    const out = formatDate(s);
    return out === '—' ? '—' : out;
  };

  const inInclusiveRange = (d) => {
    if (!rangeBounds) return false;
    return compareLocalDay(d, rangeBounds.lo) >= 0 && compareLocalDay(d, rangeBounds.hi) <= 0;
  };

  const popover =
    open &&
    createPortal(
      <div
        ref={popRef}
        className={styles.popover}
        style={{ top: pos.top, left: pos.left }}
        role="dialog"
        aria-label="Custom date range"
        data-cnr-custom-range-popover
      >
        <div className={styles.monthHeader}>
          <button type="button" className={styles.monthTitleBtn} onClick={() => setShowMonthPick((s) => !s)}>
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
          <div className={styles.monthSelectRow}>
            <select className={styles.monthSelect} value={viewMonth0} onChange={(e) => setViewMonth0(Number(e.target.value))}>
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select className={styles.monthSelect} value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
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
            const d0 = startOfLocalDay(date);
            const muted = !inCurrentMonth;
            const inRange = d0 && inInclusiveRange(d0);
            const isS = draftStart && d0 && isSameLocalDay(d0, draftStart);
            const isE = draftEnd && d0 && isSameLocalDay(d0, draftEnd);
            const endpoint = isS || isE;
            return (
              <button
                key={idx}
                type="button"
                className={`${styles.dayCell} ${muted ? styles.dayMuted : ''} ${inRange ? styles.dayInRange : ''}`.trim()}
                onClick={() => onDayClick(date)}
              >
                <span className={`${styles.dayCircle} ${endpoint ? styles.dayEndpoint : ''}`.trim()}>{date.getDate()}</span>
              </button>
            );
          })}
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.ghostBtn} onClick={onClear}>
            Clear
          </button>
          <button type="button" className={styles.primaryBtn} onClick={onApply}>
            Apply
          </button>
        </div>
      </div>,
      document.body
    );

  return (
    <div ref={wrapRef} className={styles.root}>
      <div className={styles.row}>
        <div className={styles.fieldGrow}>
          <div className={styles.miniLabel}>{startLabel}</div>
          <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
            <CalendarGlyph className={styles.calIcon} />
            <span className={startValue ? '' : styles.triggerMuted}>{disp(startValue)}</span>
          </button>
        </div>
        <span className={styles.arrow} aria-hidden>
          →
        </span>
        <div className={styles.fieldGrow}>
          <div className={styles.miniLabel}>{endLabel}</div>
          <button type="button" className={styles.trigger} onClick={() => setOpen(true)}>
            <CalendarGlyph className={styles.calIcon} />
            <span className={endValue ? '' : styles.triggerMuted}>{disp(endValue)}</span>
          </button>
        </div>
      </div>
      {popover}
    </div>
  );
}
