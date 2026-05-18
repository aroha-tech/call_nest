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
  readOnly = false,
  /** `table` — high-contrast box for admin list cells (light + dark themes). */
  variant = 'default',
  className = '',
  labelClassName = '',
  required = false,
}) {
  const { text: labelText, hasInlineRequiredMark } = parseLabel(label);
  const showRequiredMark = required || hasInlineRequiredMark;
  const isDisabled = disabled && !readOnly;
  const isTableVariant = variant === 'table';

  return (
    <label
      className={`${styles.checkbox} ${isDisabled ? styles.disabled : ''} ${readOnly ? styles.readOnly : ''} ${isTableVariant ? styles.tableVariant : ''} ${className}`.trim()}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={isDisabled}
        readOnly={readOnly}
        className={styles.input}
      />
      <span className={styles.checkmark} />
      {label && (
        <span className={`${styles.label} ${labelClassName}`.trim()}>
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
