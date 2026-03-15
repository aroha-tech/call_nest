import React from 'react';
import styles from './Checkbox.module.scss';

export function Checkbox({
  id,
  label,
  checked = false,
  onChange,
  disabled = false,
  className = '',
}) {
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
      {label && <span className={styles.label}>{label}</span>}
    </label>
  );
}
