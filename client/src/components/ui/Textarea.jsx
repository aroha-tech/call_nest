import React from 'react';
import { InfoHelpIcon } from './InfoHelpIcon';
import styles from './Textarea.module.scss';

/**
 * Controlled textarea with label + error. Mirrors `Input` API.
 */
export function Textarea({ id, label, error, hint, className = '', textareaClassName = '', rows = 4, ...props }) {
  const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={textareaId} className={styles.label}>
            {label}
          </label>
          <InfoHelpIcon title={`${label} info`} modalTitle={label} message={hint} className={styles.hintInfoBtn} />
        </div>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        className={`${styles.textarea} ${error ? styles.hasError : ''} ${textareaClassName}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${textareaId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {null}
    </div>
  );
}

