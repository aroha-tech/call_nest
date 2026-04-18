import React from 'react';
import { Button } from '../ui/Button';
import listStyles from './adminDataList.module.scss';

/**
 * Groups list filters with Apply (runs API / refetch) and Reset (defaults + refetch).
 * @param {boolean} [fluid] — When true, children manage their own width (e.g. a multi-field panel). Default: compact selects side-by-side.
 */
export function FilterBar({
  children,
  onApply,
  onReset,
  applyLabel = 'Apply',
  resetLabel = 'Reset',
  fluid = false,
}) {
  return (
    <div className={listStyles.filterBar}>
      <div
        className={`${listStyles.filterBarFields} ${fluid ? listStyles.filterBarFieldsFluid : ''}`.trim()}
      >
        {children}
      </div>
      <div className={listStyles.filterBarActions}>
        <Button type="button" size="sm" onClick={onApply}>
          {applyLabel}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onReset}>
          {resetLabel}
        </Button>
      </div>
    </div>
  );
}
