import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from './InfoHelpIcon.module.scss';

/**
 * Shows a compact info icon with inline help popover.
 */
export function InfoHelpIcon({
  title = 'Information',
  message,
  modalTitle,
  size = 'sm',
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const resolvedModalTitle = useMemo(() => modalTitle || title || 'Information', [modalTitle, title]);

  useEffect(() => {
    if (!message || !open) return undefined;
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, message]);

  useLayoutEffect(() => {
    if (!message || !open || !btnRef.current || !popRef.current) return;
    const btnRect = btnRef.current.getBoundingClientRect();
    const popRect = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const gap = 8;
    let left = btnRect.left;
    let top = btnRect.bottom + gap;

    if (left + popRect.width > vw - 8) left = vw - popRect.width - 8;
    if (left < 8) left = 8;

    if (top + popRect.height > vh - 8) {
      top = btnRect.top - popRect.height - gap;
    }
    if (top < 8) top = 8;

    setPos({ top, left });
  }, [open, message, resolvedModalTitle]);

  if (!message) return null;

  return (
    <span ref={wrapRef} className={`${styles.wrap} ${className}`.trim()}>
      <button
        ref={btnRef}
        type="button"
        className={`${styles.infoBtn} ${styles[size] || styles.sm}`}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.glyph} aria-hidden>!</span>
      </button>
      {open ? (
        <div
          ref={popRef}
          className={styles.popover}
          role="dialog"
          aria-label={resolvedModalTitle}
          style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        >
          <button
            type="button"
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Close help"
          >
            ×
          </button>
          <p className={styles.popoverTitle}>{resolvedModalTitle}</p>
          <p className={styles.message}>{message}</p>
        </div>
      ) : null}
    </span>
  );
}
