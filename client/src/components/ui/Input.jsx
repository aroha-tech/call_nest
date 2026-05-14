import React from 'react';
import { InfoHelpIcon } from './InfoHelpIcon';
import styles from './Input.module.scss';

function parseLabel(label) {
  if (typeof label !== 'string') {
    return { text: label, hasInlineRequiredMark: false };
  }
  const trimmed = label.trimEnd();
  if (!trimmed.endsWith('*')) {
    return { text: label, hasInlineRequiredMark: false };
  }
  return { text: trimmed.slice(0, -1).trimEnd(), hasInlineRequiredMark: true };
}

/**
 * Controlled text input with label, error, and optional suffix (e.g. show password).
 */
export function Input({
  id,
  label,
  type = 'text',
  error,
  hint,
  prefix,
  suffix,
  className = '',
  inputClassName = '',
  required = false,
  ...props
}) {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;
  const { text: labelText, hasInlineRequiredMark } = parseLabel(label);
  const showRequiredMark = required || hasInlineRequiredMark;

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={inputId} className={styles.label}>
            {labelText}
            {showRequiredMark ? (
              <span className={styles.requiredMark} aria-hidden="true">
                {' *'}
              </span>
            ) : null}
          </label>
          <InfoHelpIcon title={`${label} info`} modalTitle={label} message={hint} className={styles.hintInfoBtn} />
        </div>
      )}
      <div className={styles.inputWrap}>
        {prefix && <div className={styles.prefix}>{prefix}</div>}
        <input
          id={inputId}
          type={type}
          className={`${styles.input} ${error ? styles.hasError : ''} ${prefix ? `${styles.hasPrefix} hasPrefix` : ''} ${suffix ? styles.hasSuffix : ''} ${inputClassName}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {suffix && <div className={styles.suffix}>{suffix}</div>}
      </div>
      {error && (
        <p id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {null}
    </div>
  );
}
