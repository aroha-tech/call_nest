import React from 'react';
import styles from './Select.module.scss';

export function Select({
  id,
  label,
  options = [],
  value,
  onChange,
  placeholder = 'Select...',
  error,
  disabled = false,
  className = '',
  /** When true, empty value is a real choice (e.g. clear optional field), not a disabled placeholder row. */
  allowEmpty = false,
  ...props
}) {
  const selectId = id || `select-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${styles.select} ${error ? styles.hasError : ''}`}
        {...props}
      >
        <option value="" disabled={!allowEmpty}>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
