import React from 'react';
import { Button } from '../ui/Button';
import listStyles from './adminDataList.module.scss';

/**
 * Groups list filters with Apply (runs API / refetch) and Reset (defaults + refetch).
 */
export function FilterBar({ children, onApply, onReset, applyLabel = 'Apply', resetLabel = 'Reset' }) {
  return (
    <div className={listStyles.filterBar}>
      <div className={listStyles.filterBarFields}>{children}</div>
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
