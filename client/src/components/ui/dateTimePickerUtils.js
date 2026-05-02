/** Local date/time helpers for custom pickers (values match `<input type=\"date\">` / `datetime-local`). */

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dateToDateOnlyString(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** `YYYY-MM-DDTHH:mm` in local time */
export function dateToDateTimeLocalString(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

export function formatDateTimeLocalInputValue(d) {
  return dateToDateTimeLocalString(d);
}

export function parseDateOnly(ymd) {
  const s = String(ymd ?? '').trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day, 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseDateTimeLocal(val) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const n = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(n.length === 16 ? `${n}:00` : n);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date part from `YYYY-MM-DD` or `datetime-local` */
export function parseToLocalDay(val) {
  const s = String(val ?? '').trim();
  if (!s) return null;
  const dayPart = s.includes('T') ? s.slice(0, 10) : s.slice(0, 10);
  return parseDateOnly(dayPart);
}

export function dateOnlyToDisplayUs(ymd) {
  const d = parseDateOnly(ymd);
  if (!d) return '';
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(d);
}

export function dateTimeLocalToDisplay(val, use12Hour) {
  const d = parseDateTimeLocal(val);
  if (!d) return '';
  if (use12Hour) {
    return new Intl.DateTimeFormat('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function startOfLocalDay(d) {
  const x = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d) {
  const x = d instanceof Date ? new Date(d.getTime()) : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return new Date(x.getFullYear(), x.getMonth(), x.getDate(), 23, 59, 0, 0);
}

/** @returns {{ date: Date, inCurrentMonth: boolean }[]} length 42 */
export function getMonthCalendarCells(viewYear, month0) {
  const first = new Date(viewYear, month0, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(viewYear, month0 + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - startOffset + 1;
    const date = new Date(viewYear, month0, dayNum, 12, 0, 0, 0);
    const inCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
    cells.push({ date, inCurrentMonth });
  }
  return cells;
}

export function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function compareLocalDay(a, b) {
  const da = startOfLocalDay(a);
  const db = startOfLocalDay(b);
  if (!da || !db) return 0;
  return da.getTime() - db.getTime();
}
