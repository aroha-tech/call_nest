import React, { useEffect, useMemo } from 'react';
import { useToast } from '../../context/ToastContext';
import styles from './Alert.module.scss';

function flattenToText(node) {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenToText).filter(Boolean).join(' ');
  if (React.isValidElement(node)) {
    if (node.type === React.Fragment) return flattenToText(node.props?.children);
    return flattenToText(node.props?.children);
  }
  return '';
}

function resolveDisplay(display, variant) {
  if (display === 'inline' || display === 'toast') return display;
  if (variant === 'error' || variant === 'success') return 'toast';
  return 'inline';
}

/**
 * Inline callout (info / warning) or surfaces error/success as a global toast by default.
 * Use `display="inline"` to keep error/success in-page (e.g. small widgets or full-page error states).
 */
export function Alert({
  variant = 'info',
  title,
  children,
  className = '',
  style,
  display = 'auto',
  toastDuration,
}) {
  const { showToast } = useToast();
  const resolved = resolveDisplay(display, variant);

  const titleText = useMemo(() => (title != null ? String(title).trim() : ''), [title]);
  const bodyText = useMemo(() => flattenToText(children).trim(), [children]);

  useEffect(() => {
    if (resolved !== 'toast') return;
    if (!titleText && !bodyText) return;

    const opts = {};
    if (Number.isFinite(toastDuration)) {
      opts.durationMs = toastDuration;
    }
    if (titleText && bodyText) {
      opts.title = titleText;
      showToast(bodyText, variant, opts);
    } else if (bodyText) {
      showToast(bodyText, variant, opts);
    } else {
      showToast(titleText, variant, opts);
    }
  }, [resolved, variant, titleText, bodyText, showToast, toastDuration]);

  if (resolved === 'toast') return null;

  const classNames = [styles.alert, styles[variant], className].filter(Boolean).join(' ');
  return (
    <div className={classNames} role="alert" style={style}>
      {title ? <strong className={styles.title}>{title}</strong> : null}
      {children ? <span className={styles.body}>{children}</span> : null}
    </div>
  );
}
