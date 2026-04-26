import React, { useEffect, useRef } from 'react';
import styles from './SlidePanel.module.scss';

/**
 * Full-height panel that slides in from the left — for long create/edit forms.
 * Use {@link Modal} for short dialogs; keep {@link ConfirmModal} for confirmations.
 */
export function SlidePanel({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  closeOnOverlay = true,
  closeOnEscape = true,
}) {
  const overlayRef = useRef(null);

  useEffect(() => {
    const handleEscape = (e) => {
      if (closeOnEscape && e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose, closeOnEscape]);

  const handleOverlayClick = (e) => {
    if (closeOnOverlay && e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const sizeClass = styles[size] || styles.lg;

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick} role="presentation">
      <aside
        className={`${styles.panel} ${sizeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'slide-panel-title' : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          {title ? (
            <h2 id="slide-panel-title" className={styles.title}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </aside>
    </div>
  );
}
