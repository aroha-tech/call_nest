import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MaterialSymbol } from './MaterialSymbol';
import styles from './SearchInput.module.scss';

function SearchGlyph({ className = '' }) {
  return <MaterialSymbol name="search" size="sm" className={`${styles.searchGlyph} ${className}`.trim()} />;
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = 'Search... (press Enter)',
  className = '',
  /** When true, icon-only until opened; field clips open/closed from the right with animation. */
  expandable = true,
}) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const hasQuery = Boolean(String(localValue ?? '').trim());

  const handleChange = useCallback(
    (e) => {
      const newValue = e.target.value;
      setLocalValue(newValue);
      if (onChange) onChange(e);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (expandable && expanded && e.key === 'Escape') {
        e.preventDefault();
        setExpanded(false);
        return;
      }
      if (e.key === 'Enter' && onSearch) {
        e.preventDefault();
        onSearch(localValue);
      }
    },
    [expandable, expanded, localValue, onSearch]
  );

  const handleClear = useCallback(
    (e) => {
      e.stopPropagation();
      setLocalValue('');
      if (onChange) onChange({ target: { value: '' } });
      if (onSearch) onSearch('');
      inputRef.current?.focus();
    },
    [onChange, onSearch]
  );

  const open = useCallback(() => setExpanded(true), []);

  const onTrailingIconClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (!expandable) {
        if (onSearch) onSearch(localValue);
        return;
      }
      if (!expanded) {
        open();
        return;
      }
      if (onSearch) onSearch(localValue);
    },
    [expandable, expanded, localValue, onSearch, open]
  );

  useEffect(() => {
    if (value !== undefined) {
      setLocalValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (!expandable || !expanded) return;
    inputRef.current?.focus();
  }, [expandable, expanded]);

  useEffect(() => {
    if (!expandable || !expanded) return;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setExpanded(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [expandable, expanded]);

  const shellMods = !expandable ? styles.shellStatic : styles.shellExpandable;

  if (!expandable) {
    return (
      <div className={`${styles.shell} ${shellMods} ${className}`}>
        <div className={`${styles.pill} ${styles.pillAlwaysOpen}`}>
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={styles.input}
          />
          {localValue ? (
            <button type="button" className={styles.clear} onClick={handleClear} aria-label="Clear search">
              ✕
            </button>
          ) : null}
          <button type="button" className={styles.iconBtn} onClick={onTrailingIconClick} aria-label="Search">
            <SearchGlyph />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`${styles.shell} ${shellMods} ${className}`}>
      <div
        className={`${styles.pill} ${expanded ? styles.pillOpen : styles.pillShut} ${hasQuery && !expanded ? styles.pillShutHasValue : ''}`}
      >
        <div className={`${styles.inputTrack} ${expanded ? styles.inputTrackOpen : ''}`}>
          <input
            ref={inputRef}
            type="text"
            value={localValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={styles.input}
            tabIndex={expanded ? 0 : -1}
          />
          {expanded && localValue ? (
            <button type="button" className={styles.clear} onClick={handleClear} aria-label="Clear search">
              ✕
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onTrailingIconClick}
          aria-label={expanded ? 'Run search' : 'Open search'}
          aria-expanded={expanded}
        >
          <SearchGlyph />
        </button>
      </div>
    </div>
  );
}
