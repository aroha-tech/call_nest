import React from 'react';
import styles from './Input.module.scss';

/**
 * Controlled text input with label, error, optional hint, and optional suffix (e.g. show password).
 */
export function Input({
  id,
  label,
  type = 'text',
  error,
  hint,
  suffix,
  className = '',
  inputClassName = '',
  ...props
}) {
  const inputId = id || `input-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.inputWrap}>
        <input
          id={inputId}
          type={type}
          className={`${styles.input} ${error ? styles.hasError : ''} ${suffix ? styles.hasSuffix : ''} ${inputClassName}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {suffix && <div className={styles.suffix}>{suffix}</div>}
      </div>
      {error && (
        <p id={`${inputId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
