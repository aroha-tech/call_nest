import React from 'react';
import { Spinner } from '../ui/Spinner';
import listStyles from './adminDataList.module.scss';

/**
 * Wraps table empty state + scroll body. First load: centered spinner in this band only.
 * Later refetches: semi-transparent overlay while keeping previous rows/empty state underneath.
 */
export function TableDataRegion({ loading, hasCompletedInitialFetch, children }) {
  const showOverlay = loading && hasCompletedInitialFetch;
  const showFirstOnlySpinner = !hasCompletedInitialFetch && loading;
  return (
    <div className={listStyles.tableDataRegion}>
      {showOverlay ? (
        <div
          className={listStyles.tableRefreshingOverlay}
          aria-busy="true"
          aria-label="Loading"
        >
          <Spinner size="lg" />
        </div>
      ) : null}
      {showFirstOnlySpinner ? (
        <div className={listStyles.firstLoadSpinnerWrap}>
          <Spinner size="lg" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
