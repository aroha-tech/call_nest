import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './MultiSelectDropdown.module.scss';

function parseStoredMultiselect(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map((x) => String(x));
  } catch {
    // ignore
  }
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Multi-value field: one closed control opens a panel with checkboxes (same JSON array storage as multiselect).
 */
export function MultiSelectDropdown({
  label,
  options = [],
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Select…',
  error,
}) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);

  const selected = new Set(parseStoredMultiselect(value).map(String));
  const orderedSelected = options.map(String).filter((o) => selected.has(o));
  const summaryText =
    orderedSelected.length === 0 ? placeholder : orderedSelected.join(', ');

  const commit = useCallback(
    (nextSet) => {
      const ordered = options.map(String).filter((o) => nextSet.has(o));
      onChange(ordered.length ? JSON.stringify(ordered) : '');
    },
    [onChange, options]
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrapper} ref={rootRef}>
      {label ? (
        <span className={styles.label} id={`${id}-label`}>
          {label}
        </span>
      ) : null}
      <button
        type="button"
        className={`${styles.trigger} ${error ? styles.triggerError : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-labelledby={label ? `${id}-label` : undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={styles.triggerText} title={summaryText}>
          {summaryText}
        </span>
        <span className={styles.chevron} aria-hidden>
          ▾
        </span>
      </button>
      {open && options.length > 0 ? (
        <div id={listId} className={styles.panel} role="listbox" aria-multiselectable="true">
          {options.map((opt, idx) => {
            const optStr = String(opt);
            const checked = selected.has(optStr);
            return (
              <label key={`${optStr}-${idx}`} className={styles.option}>
                <input
                  type="checkbox"
                  className={styles.optionInput}
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(optStr);
                    else next.delete(optStr);
                    commit(next);
                  }}
                />
                <span className={styles.optionLabel}>{optStr}</span>
              </label>
            );
          })}
        </div>
      ) : null}
      {open && options.length === 0 ? (
        <div className={styles.panel} role="status">
          <span className={styles.empty}>No options configured.</span>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
