import React from 'react';
import styles from './Checkbox.module.scss';

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

export function Checkbox({
  id,
  label,
  checked = false,
  onChange,
  disabled = false,
  className = '',
  required = false,
}) {
  const { text: labelText, hasInlineRequiredMark } = parseLabel(label);
  const showRequiredMark = required || hasInlineRequiredMark;

  return (
    <label className={`${styles.checkbox} ${disabled ? styles.disabled : ''} ${className}`}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={styles.input}
      />
      <span className={styles.checkmark} />
      {label && (
        <span className={styles.label}>
          {labelText}
          {showRequiredMark ? (
            <span className={styles.requiredMark} aria-hidden="true">
              {' *'}
            </span>
          ) : null}
        </span>
      )}
    </label>
  );
}
