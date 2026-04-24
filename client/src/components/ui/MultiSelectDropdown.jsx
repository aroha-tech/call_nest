import React, { useCallback, useId, useMemo } from 'react';
import Select from 'react-select';
import styles from './MultiSelectDropdown.module.scss';

function parseStoredMultiselect(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p.map((x) => String(x));
  } catch {
    // ignore
  }
  return String(raw)
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeOptions(options) {
  if (!options?.length) {
    return { selectOptions: [], values: [], labelFor: (v) => v };
  }
  const first = options[0];
  if (typeof first === 'object' && first !== null && 'value' in first) {
    const map = new Map(options.map((o) => [String(o.value), String(o.label ?? o.value)]));
    const selectOptions = options.map((o) => ({
      value: String(o.value),
      label: String(o.label ?? o.value),
    }));
    return {
      selectOptions,
      values: selectOptions.map((o) => o.value),
      labelFor: (v) => map.get(String(v)) ?? String(v),
    };
  }
  const values = options.map((o) => String(o));
  return {
    selectOptions: values.map((v) => ({ value: v, label: v })),
    values,
    labelFor: (v) => String(v),
  };
}

function getReactSelectStyles({ searchable = true } = {}) {
  return {
    control: (base, state) => ({
      ...base,
      minHeight: 34,
      backgroundColor: 'var(--color-input-bg, #1a1b26)',
      borderColor: state.isFocused
        ? 'var(--color-input-border-focus)'
        : 'var(--color-input-border)',
      boxShadow: state.isFocused ? '0 0 0 3px var(--color-focus-ring)' : 'none',
      '&:hover': {
        borderColor: state.isFocused
          ? 'var(--color-input-border-focus)'
          : 'var(--color-input-border-hover)',
      },
    }),
    menuPortal: (base) => ({ ...base, zIndex: 11000 }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--color-bg-elevated, #252536)',
      border: '1px solid var(--color-input-border, rgba(255, 255, 255, 0.12))',
      zIndex: 11000,
    }),
    option: (base, state) => ({
      ...base,
      cursor: 'pointer',
      backgroundColor: state.isSelected
        ? 'color-mix(in srgb, var(--color-text-primary) 22%, var(--color-bg-elevated))'
        : state.isFocused
          ? 'color-mix(in srgb, var(--color-text-primary) 10%, transparent)'
          : 'transparent',
      color: 'var(--color-text-primary, #e2e8f0)',
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'color-mix(in srgb, var(--color-text-primary) 16%, var(--color-bg-muted))',
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: 'var(--color-text-primary, #e2e8f0)',
      fontSize: '12px',
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--color-text-primary, #e2e8f0)',
      '&:hover': { backgroundColor: 'rgba(239, 68, 68, 0.35)', color: '#fff' },
    }),
    placeholder: (base) => ({
      ...base,
      color: 'var(--color-text-muted, rgba(255, 255, 255, 0.45))',
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
      backgroundColor: 'transparent',
      boxShadow: 'none',
      color: 'var(--color-text-primary, #e2e8f0)',
      caretColor: 'var(--color-text-primary, #e2e8f0)',
      ...(searchable ? { minWidth: '140px' } : {}),
    }),
    inputContainer: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
    singleValue: (base) => ({
      ...base,
      color: 'var(--color-text-primary, #e2e8f0)',
    }),
    indicatorsContainer: (base) => ({
      ...base,
      height: 32,
    }),
  };
}

/**
 * Multi-value dropdown (react-select). Value is JSON array string, same as before.
 * `options` may be string[] or { value, label }[].
 */
export function MultiSelectDropdown({
  label,
  options = [],
  value = '',
  onChange,
  disabled = false,
  placeholder = 'Select...',
  error,
  /** When false, hides the filter typing input (no narrow search box). */
  searchable = true,
}) {
  const id = useId();
  const { selectOptions, values: optionValues, labelFor } = useMemo(
    () => normalizeOptions(options),
    [options]
  );

  const selectedSet = useMemo(() => new Set(parseStoredMultiselect(value).map(String)), [value]);

  const selectedOptions = useMemo(
    () => optionValues.filter((v) => selectedSet.has(v)).map((v) => ({ value: v, label: labelFor(v) })),
    [optionValues, selectedSet, labelFor]
  );

  const handleChange = useCallback(
    (selected) => {
      const ordered = optionValues.filter((v) => (selected || []).some((s) => String(s.value) === v));
      onChange(ordered.length ? JSON.stringify(ordered) : '');
    },
    [onChange, optionValues]
  );

  const rsStyles = useMemo(() => getReactSelectStyles({ searchable }), [searchable]);

  return (
    <div className={styles.wrapper}>
      {label ? (
        <span className={styles.label} id={`${id}-label`}>
          {label}
        </span>
      ) : null}
      <Select
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-invalid={error ? true : undefined}
        instanceId={id}
        isMulti
        isSearchable={searchable}
        isDisabled={disabled}
        isClearable
        closeMenuOnSelect={false}
        hideSelectedOptions={false}
        options={selectOptions}
        value={selectedOptions}
        onChange={handleChange}
        placeholder={placeholder}
        noOptionsMessage={() => 'No options'}
        styles={rsStyles}
        menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
        menuPosition="fixed"
        classNamePrefix="cn-multiselect"
        className={error ? styles.selectError : undefined}
      />
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
