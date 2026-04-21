import React, { createContext, useCallback, useContext, useState } from 'react';
import styles from './ToastContext.module.scss';

const ToastContext = createContext(null);

let toastIdSeq = 0;

/** Avoid duplicate toasts from React StrictMode double-invocation or rapid re-renders. */
let lastDedupeSig = '';
let lastDedupeAt = 0;

function normalizeVariant(v) {
  const s = String(v || 'warning').toLowerCase();
  if (s === 'failure' || s === 'danger') return 'error';
  if (s === 'success' || s === 'error' || s === 'warning' || s === 'info') return s;
  return 'warning';
}

function ToastIcon({ variant }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (variant === 'success') {
    return (
      <svg {...common} aria-hidden>
        <path d="M20 6L9 17l-5-5" />
      </svg>
    );
  }
  if (variant === 'error') {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    );
  }
  if (variant === 'info') {
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, variant = 'warning', options = {}) => {
    const title = typeof options.title === 'string' ? options.title.trim() : '';
    const body = String(message ?? '').trim();
    if (!title && !body) return;

    const v = normalizeVariant(variant);
    const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : 4200;

    const sig = `${v}|${title}|${body}`;
    const now = Date.now();
    if (sig === lastDedupeSig && now - lastDedupeAt < 750) return;
    lastDedupeSig = sig;
    lastDedupeAt = now;

    const id = ++toastIdSeq;
    setToasts((prev) => [...prev, { id, title, message: body, variant: v, durationMs }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.region} aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.variant] ?? styles.warning}`}
            role="status"
          >
            <div className={styles.iconWrap}>
              <ToastIcon variant={t.variant} />
            </div>
            <div className={styles.body}>
              {t.title ? <div className={styles.title}>{t.title}</div> : null}
              {t.message ? <div className={styles.message}>{t.message}</div> : null}
            </div>
            <button type="button" className={styles.dismiss} aria-label="Dismiss notification" onClick={() => dismiss(t.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
