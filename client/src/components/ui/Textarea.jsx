import React from 'react';
import { InfoHelpIcon } from './InfoHelpIcon';
import styles from './Textarea.module.scss';

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
 * Controlled textarea with label + error. Mirrors `Input` API.
 */
export function Textarea({
  id,
  label,
  error,
  hint,
  className = '',
  textareaClassName = '',
  rows = 4,
  required = false,
  ...props
}) {
  const textareaId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;
  const { text: labelText, hasInlineRequiredMark } = parseLabel(label);
  const showRequiredMark = required || hasInlineRequiredMark;
  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={textareaId} className={styles.label}>
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

