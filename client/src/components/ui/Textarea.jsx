import React from 'react';
import styles from './Textarea.module.scss';

/**
 * Controlled textarea with label + error + hint. Mirrors `Input` API.
 */
export function Textarea({ id, label, error, hint, className = '', textareaClassName = '', rows = 4, ...props }) {
  const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={textareaId} className={styles.label}>
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        className={`${styles.textarea} ${error ? styles.hasError : ''} ${textareaClassName}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        {...props}
      />
      {error && (
        <p id={`${textareaId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${textareaId}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}

