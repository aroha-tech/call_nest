import React, { useState, useCallback } from 'react';
import styles from './SearchInput.module.scss';

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = 'Search... (press Enter)',
  className = '',
}) {
  const [localValue, setLocalValue] = useState(value ?? '');

  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    if (onChange) onChange(e);
  }, [onChange]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && onSearch) {
      e.preventDefault();
      onSearch(localValue);
    }
  }, [localValue, onSearch]);

  const handleClear = useCallback(() => {
    setLocalValue('');
    if (onChange) onChange({ target: { value: '' } });
    if (onSearch) onSearch('');
  }, [onChange, onSearch]);

  // Sync external value changes
  React.useEffect(() => {
    if (value !== undefined && value !== localValue) {
      setLocalValue(value);
    }
  }, [value]);

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <span className={styles.icon}>🔍</span>
      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={styles.input}
      />
      {localValue && (
        <button
          type="button"
          className={styles.clear}
          onClick={handleClear}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}
