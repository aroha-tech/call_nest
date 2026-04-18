import React, { useMemo } from 'react';
import { Select } from './Select';
import { Input } from './Input';
import {
  TIME_RANGE_PRESET,
  TIME_RANGE_PRESET_OPTIONS,
  TIME_RANGE_LEGACY_TODAY_OPTION,
} from '../../utils/dateRangePresets';
import styles from './DateRangePresetControl.module.scss';

/**
 * Preset time range + optional custom from/to (date or datetime-local).
 * @param {'date'|'datetime'} variant
 */
export function DateRangePresetControl({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  variant = 'datetime',
  startLabel,
  endLabel,
  className,
  includeLegacyTodayOption = false,
  selectLabel = 'Time range',
  /** 'default' | 'panel' — panel: high-contrast label + select for dark filter cards (dashboard). */
  tone = 'default',
}) {
  const options = useMemo(() => {
    const base = [...TIME_RANGE_PRESET_OPTIONS];
    if (includeLegacyTodayOption && preset === TIME_RANGE_PRESET.TODAY_CALENDAR) {
      return [base[0], TIME_RANGE_LEGACY_TODAY_OPTION, ...base.slice(1)];
    }
    return base;
  }, [includeLegacyTodayOption, preset]);

  const sl = startLabel || (variant === 'date' ? 'From' : 'Started after');
  const el = endLabel || (variant === 'date' ? 'To' : 'Started before');
  const inputType = variant === 'date' ? 'date' : 'datetime-local';

  const isPanel = tone === 'panel';

  return (
    <div className={`${styles.root} ${isPanel ? styles.rootPanel : ''} ${className || ''}`.trim()}>
      <Select
        label={selectLabel}
        value={preset}
        onChange={(e) => onPresetChange(e.target.value)}
        options={options}
        labelClassName={isPanel ? styles.panelSelectLabel : ''}
        selectClassName={isPanel ? styles.panelSelect : ''}
      />
      {preset === TIME_RANGE_PRESET.CUSTOM ? (
        <div className={`${styles.customRow} ${isPanel ? styles.customRowPanel : ''}`}>
          <Input label={sl} type={inputType} value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} />
          <Input label={el} type={inputType} value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} />
        </div>
      ) : null}
    </div>
  );
}
