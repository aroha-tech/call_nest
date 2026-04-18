import React, { useCallback, useId, useMemo } from 'react';
import ReactSelect from 'react-select';
import styles from './Select.module.scss';

function createSelectStyles({ compact = false } = {}) {
  const minHeight = compact ? 34 : 40;
  const fontSize = compact ? '12px' : undefined;

  return {
    control: (base, state) => ({
      ...base,
      minHeight,
      minWidth: 0,
      fontSize,
      fontWeight: 500,
      backgroundColor: 'var(--color-input-bg, #1a1b26)',
      borderColor: state.isFocused
        ? 'var(--color-input-border-focus, #6366f1)'
        : 'var(--color-input-border, rgba(255, 255, 255, 0.12))',
      boxShadow: state.isFocused ? '0 0 0 3px var(--color-focus-ring, rgba(99, 102, 241, 0.25))' : 'none',
      '&:hover': {
        borderColor: state.isFocused
          ? 'var(--color-input-border-focus, #6366f1)'
          : 'var(--color-input-border-hover, rgba(255, 255, 255, 0.2))',
      },
    }),
    menuPortal: (base) => ({ ...base, zIndex: 20000 }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--color-bg-elevated, #252536)',
      border: '1px solid var(--color-input-border, rgba(255, 255, 255, 0.12))',
      zIndex: 20000,
    }),
    option: (base, state) => ({
      ...base,
      cursor: 'pointer',
      fontSize,
      backgroundColor: state.isSelected
        ? 'rgba(99, 102, 241, 0.35)'
        : state.isFocused
          ? 'rgba(255, 255, 255, 0.06)'
          : 'transparent',
      color: 'var(--color-text-primary, #e2e8f0)',
    }),
    placeholder: (base) => ({
      ...base,
      color: 'var(--color-text-muted, rgba(255, 255, 255, 0.45))',
    }),
    /**
     * Hide the filter input when the menu is closed so the UA “white chip” does not sit on the label.
     * When the menu is open it must stay visible and focusable for type-to-filter.
     */
    input: (base, state) => {
      const menuOpen = Boolean(state.selectProps?.menuIsOpen);
      return {
        ...base,
        margin: 0,
        padding: 0,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        color: menuOpen ? 'var(--color-text-primary, #e2e8f0)' : 'transparent',
        caretColor: menuOpen ? 'var(--color-text-primary, #e2e8f0)' : 'transparent',
        opacity: menuOpen ? 1 : 0,
      };
    },
    inputContainer: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--color-text-primary, #e2e8f0)',
    }),
    /** Single continuous control — no vertical rule before the chevron. */
    indicatorSeparator: () => ({
      display: 'none',
    }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: compact ? '6px 8px' : '8px 10px',
      color: 'var(--color-text-muted, rgba(255, 255, 255, 0.45))',
      '&:hover': {
        color: 'var(--color-text-primary, #e2e8f0)',
      },
    }),
    indicatorsContainer: (base) => ({
      ...base,
      height: compact ? 32 : 38,
    }),
    valueContainer: (base) => ({
      ...base,
      padding: compact ? '2px 10px' : '6px 4px 6px 12px',
    }),
  };
}

function normalizeOptions(options) {
  return (options || []).map((o) => ({
    value: String(o.value),
    label: String(o.label ?? o.value),
  }));
}

function emitChange(onChange, value) {
  if (typeof onChange !== 'function') return;
  onChange({ target: { value } });
}

/**
 * Single-value dropdown with type-to-search (react-select). API matches the old native `<select>`:
 * `onChange` receives `{ target: { value } }` with string values.
 */
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
  wrapperClassName = '',
  labelClassName = '',
  selectClassName = '',
  allowEmpty = false,
  /** When false, hides the filter typing input. Default true. */
  searchable = true,
  /** Smaller control + menu rows (e.g. dense tables). */
  compact = false,
  components: userComponents,
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const selectOptions = useMemo(() => normalizeOptions(options), [options]);
  const emptyChoice = useMemo(() => selectOptions.find((o) => o.value === ''), [selectOptions]);

  const selected = useMemo(() => {
    const strVal = value == null ? '' : String(value);
    if (strVal === '') {
      if (emptyChoice) return emptyChoice;
      return null;
    }
    const found = selectOptions.find((o) => o.value === strVal);
    if (found) return found;
    return { value: strVal, label: strVal };
  }, [value, selectOptions, emptyChoice]);

  const handleChange = useCallback(
    (opt) => {
      const next = opt == null ? '' : String(opt.value);
      emitChange(onChange, next);
    },
    [onChange]
  );

  const rsStyles = useMemo(() => createSelectStyles({ compact }), [compact]);

  return (
    <div className={`${styles.wrapper} ${className} ${wrapperClassName}`.trim()}>
      {label ? (
        <label htmlFor={inputId} className={`${styles.label} ${labelClassName}`.trim()}>
          {label}
        </label>
      ) : null}
      <ReactSelect
        {...rest}
        inputId={inputId}
        aria-invalid={error ? true : undefined}
        instanceId={`${autoId}-sel`}
        isDisabled={disabled}
        isSearchable={searchable}
        isClearable={allowEmpty}
        options={selectOptions}
        value={selected}
        onChange={handleChange}
        placeholder={placeholder}
        styles={rsStyles}
        {...(userComponents ? { components: userComponents } : {})}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        classNamePrefix="cn-select"
        className={`${selectClassName || ''} ${error ? styles.selectError : ''}`.trim() || undefined}
        noOptionsMessage={() => 'No matches'}
        blurInputOnSelect
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Searchable pick list that always returns to the placeholder after a choice (e.g. “Add tag…”).
 * `onPick` receives the option value as a string (same as `Select` change events).
 */
export function SelectOncePick({
  options = [],
  onPick,
  excludeValues = [],
  placeholder = 'Add…',
  disabled = false,
  className = '',
  ariaLabel,
  searchable = true,
  compact = false,
}) {
  const autoId = useId();
  const filtered = useMemo(() => {
    const ex = new Set(excludeValues.map(String));
    return normalizeOptions(options).filter((o) => !ex.has(o.value));
  }, [options, excludeValues]);

  const handleChange = useCallback(
    (opt) => {
      if (opt) emitChange(onPick, String(opt.value));
    },
    [onPick]
  );

  const rsStyles = useMemo(() => createSelectStyles({ compact }), [compact]);

  return (
    <div className={`${styles.oncePick} ${className}`.trim()}>
      <ReactSelect
        aria-label={ariaLabel}
        inputId={`${autoId}-pick`}
        instanceId={`${autoId}-pick`}
        isDisabled={disabled}
        isSearchable={searchable}
        isClearable={false}
        value={null}
        onChange={handleChange}
        options={filtered}
        placeholder={placeholder}
        styles={rsStyles}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        classNamePrefix="cn-select"
        noOptionsMessage={() => 'No matches'}
        blurInputOnSelect
        controlShouldRenderValue={false}
      />
    </div>
  );
}
